import {Alert, Spinner} from '@inkjs/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdin, useStdout, useWindowSize} from 'ink';
import {ActionPanel} from './components/ActionPanel.js';
import {ContextBar} from './components/ContextBar.js';
import {Header} from './components/Header.js';
import {HelpWindow} from './components/HelpWindow.js';
import {FloatingLogWindow} from './components/FloatingLogWindow.js';
import {LogPanel, buildLogLines} from './components/LogPanel.js';
import {WorktreeList} from './components/WorktreeList.js';
import type {AppActions, AppLogRefresh, AppModel, AppRow, AppStatus, RowTag} from './core/runtime.js';
import {clampSelectionIndex, decideEnterInteraction, decideSetupInteraction, getNextSelectedPath, getSelectedIndex} from './core/tui-interaction.js';

export interface ShellDimensions {
	rootWidth: number;
	rootHeight: number;
	bodyWidth: number;
	listWidth: number;
	actionWidth: number;
}

export interface AppWindowSize {
	columns: number;
	rows: number;
}

const ENABLE_MOUSE_TRACKING = '\u001B[?1000h\u001B[?1006h';
const DISABLE_MOUSE_TRACKING = '\u001B[?1000l\u001B[?1006l';

type MouseWheelEvent = {
	readonly delta: -1 | 1;
	readonly x?: number;
	readonly y?: number;
};

function parseMouseWheelEvents(input: string): MouseWheelEvent[] {
	const events: MouseWheelEvent[] = [];
	const sgrMousePattern = /\u001B\[<(\d+);(\d+);(\d+)[mM]/g;
	for (const match of input.matchAll(sgrMousePattern)) {
		const button = Number(match[1]);
		if (button !== 64 && button !== 65) {
			continue;
		}

		const x = Number(match[2]);
		const y = Number(match[3]);
		events.push({
			delta: button === 65 ? 1 : -1,
			x: Number.isFinite(x) ? x : undefined,
			y: Number.isFinite(y) ? y : undefined,
		});
	}

	return events;
}

export function getMouseWheelDelta(input: string): number {
	return parseMouseWheelEvents(input).reduce((sum, event) => sum + event.delta, 0);
}


export function getShellDimensions(columns: number, rows: number): ShellDimensions {
	const rootWidth = Math.max(columns, 1);
	const rootHeight = Math.max(rows, 1);
	const bodyWidth = rootWidth;
	const maxListWidth = Math.max(1, bodyWidth - 21);
	const desiredListWidth = Math.max(1, Math.floor((bodyWidth - 1) * 0.34));
	const listWidth = Math.min(42, desiredListWidth, maxListWidth);
	const actionWidth = Math.max(1, bodyWidth - listWidth - 1);
	return {rootWidth, rootHeight, bodyWidth, listWidth, actionWidth};
}

export function shouldUseCompactLayout(_columns: number, _rows: number, _worktreeCount = 0): boolean {
	return false;
}

export function shouldUseMinimalLayout(columns: number, rows: number): boolean {
	return columns < 20 || rows < 10;
}

const STACKED_LAYOUT_FRAME_ROWS = 9;
const HEADER_HEIGHT = 5;
const CONTEXT_BAR_HEIGHT = 4;
const PANE_GAP_WIDTH = 1;
const MIN_STACKED_PANE_HEIGHT = 9;

export function shouldStackPanes(columns: number, rows: number, _worktreeCount = 0): boolean {
	// Header + context bar consume the fixed chrome; each stacked pane still keeps ~6 visible content lines at the minimum height.
	return columns < 96 && rows >= STACKED_LAYOUT_FRAME_ROWS + (MIN_STACKED_PANE_HEIGHT * 2);
}

function getLogPaneHeight(_rootHeight: number): number {
	// Each bordered log pane keeps ~6 visible content lines at 9 rows.
	return 9;
}

const ACTIVE_TAG: RowTag = 'active';
const ALREADY_ACTIVE_MESSAGE = 'already active';

function syncActiveTags(rows: AppRow[], activePath: string | null): AppRow[] {
	let changed = false;
	const nextRows = rows.map(row => {
		const isActive = row.path === activePath;
		const hasActiveTag = row.tags.includes(ACTIVE_TAG);
		if (isActive === hasActiveTag) {
			return row;
		}

		changed = true;
		return {
			...row,
			tags: isActive ? [...row.tags, ACTIVE_TAG] : row.tags.filter(tag => tag !== ACTIVE_TAG),
		};
	});
	return changed ? nextRows : rows;
}

function shouldRefreshLogs(model: AppModel): boolean {
	if (model.activePath === null) {
		return false;
	}
	if (model.status.kind === 'running' || model.status.kind === 'error') {
		return true;
	}
	return model.status.message === ALREADY_ACTIVE_MESSAGE;
}

function getStatusAfterLogRefresh(current: AppModel, refresh: AppLogRefresh): AppStatus {
	if (current.status.kind !== 'running') {
		return current.status;
	}
	if (current.activePath === refresh.activePath && current.activeBranch === refresh.activeBranch) {
		return current.status;
	}
	if (refresh.activePath === null) {
		return {kind: 'idle', message: 'session ended'};
	}
	if (refresh.activeBranch) {
		return {kind: 'running', message: `Active: ${refresh.activeBranch}`};
	}
	return {kind: 'running', message: 'running'};
}
export function App({
	initialModel,
	actions,
	windowSizeOverride,
}: {
	initialModel: AppModel;
	actions: AppActions;
	windowSizeOverride?: AppWindowSize;
}) {
	const {exit} = useApp();
	const {stdin} = useStdin();
	const {stdout} = useStdout();
	const liveWindowSize = useWindowSize();
	const {columns, rows} = windowSizeOverride ?? liveWindowSize;
	const [model, setModel] = useState(initialModel);
	const [selectedPath, setSelectedPath] = useState<string | null>(initialModel.rows[0]?.path ?? null);
	const [selectionScrollOffset, setSelectionScrollOffset] = useState(0);
	const [worktreeScrollOffset, setWorktreeScrollOffset] = useState(0);
	const [logScrollOffset, setLogScrollOffset] = useState(0);
	const [isLogOverlayOpen, setIsLogOverlayOpen] = useState(false);
	const [isHelpOverlayOpen, setIsHelpOverlayOpen] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<{path: string; branch: string} | null>(null);
	const [completedAlert, setCompletedAlert] = useState<string | null>(null);
	const userActionInFlightRef = useRef(false);
	const logRefreshInFlightRef = useRef(false);
	const actionGenerationRef = useRef(0);
	const previousStatusRef = useRef<AppStatus['kind']>(initialModel.status.kind);
	const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setSelectedPath(currentPath => getNextSelectedPath(model.rows, currentPath));
	}, [model.rows]);

	useEffect(() => {
		setSelectionScrollOffset(0);
	}, [selectedPath]);

	useEffect(() => {
		const becameRunning = previousStatusRef.current === 'starting' && model.status.kind === 'running';
		if (becameRunning) {
			setCompletedAlert(model.activeBranch ? `Switched to ${model.activeBranch}` : 'Worktree switch complete.');
			if (alertTimeoutRef.current !== null) {
				clearTimeout(alertTimeoutRef.current);
			}
			alertTimeoutRef.current = setTimeout(() => {
				setCompletedAlert(null);
			}, 2500);
		}
		previousStatusRef.current = model.status.kind;
	}, [model.status.kind, model.activeBranch]);

	useEffect(() => {
		return () => {
			if (alertTimeoutRef.current !== null) {
				clearTimeout(alertTimeoutRef.current);
			}
		};
	}, []);

	const confirmationOpen = pendingDelete !== null;
	const visibleStatus = confirmationOpen
		? {kind: 'idle' as const, message: `Delete ${pendingDelete.branch}? d/y confirm, Esc/n/q cancel`}
		: model.status;

	useEffect(() => {
		if (!shouldRefreshLogs(model)) {
			return;
		}
		// Only logs and active-session liveness need near-real-time updates.
		// Full worktree metadata includes GitHub PR lookups and is refreshed by
		// explicit user actions instead of a tight polling loop.
		const logRefreshInterval = setInterval(() => {
			if (userActionInFlightRef.current || logRefreshInFlightRef.current) {
				return;
			}

			const generation = actionGenerationRef.current;
			logRefreshInFlightRef.current = true;
			void actions.refreshLogs()
				.then(refresh => {
					if (generation !== actionGenerationRef.current || userActionInFlightRef.current) {
						return;
					}

					setModel(current => {
						const activeChanged = current.activePath !== refresh.activePath || current.activeBranch !== refresh.activeBranch;
						const status = getStatusAfterLogRefresh(current, refresh);
						return {
							...current,
							logs: refresh.logs,
							activePath: refresh.activePath,
							activeBranch: refresh.activeBranch,
							status,
							rows: activeChanged ? syncActiveTags(current.rows, refresh.activePath) : current.rows,
						};
					});
				})
				.catch(() => {})
				.finally(() => {
					logRefreshInFlightRef.current = false;
				});
		}, 400);

		return () => {
			clearInterval(logRefreshInterval);
		};
	}, [actions, model.activePath, model.status.kind, model.status.message]);

	useEffect(() => {
		if (confirmationOpen && !model.rows.some(row => row.path === pendingDelete.path)) {
			setPendingDelete(null);
		}
	}, [confirmationOpen, model.rows, pendingDelete]);


	const selectedIndex = useMemo(() => getSelectedIndex(model.rows, selectedPath), [model.rows, selectedPath]);
	const selected = model.rows[selectedIndex];
	const {rootWidth, rootHeight, bodyWidth, listWidth, actionWidth} = getShellDimensions(columns, rows);
	const minimalLayout = shouldUseMinimalLayout(rootWidth, rootHeight);
	const compactLayout = !minimalLayout && shouldUseCompactLayout(rootWidth, rootHeight, model.rows.length);
	const stackedLayout = !minimalLayout && !compactLayout && shouldStackPanes(rootWidth, rootHeight, model.rows.length);
	const compactDetailPane = !stackedLayout && rootHeight <= 30 && model.rows.length > 1;
	const showLogPanel = !stackedLayout && rootHeight >= 34;
	const logPaneHeight = showLogPanel ? getLogPaneHeight(rootHeight) : 0;
	const stackedPaneHeight = Math.max(3, Math.floor((rootHeight - STACKED_LAYOUT_FRAME_ROWS) / 2));
	const paneHeight = stackedLayout
		? stackedPaneHeight
		: Math.max(3, rootHeight - STACKED_LAYOUT_FRAME_ROWS - logPaneHeight);
	const selectionScrollPageSize = Math.max(1, Math.floor(paneHeight / 2));
	const logLineCount = useMemo(() => buildLogLines(model.logs).length, [model.logs]);
	const logViewportHeight = isLogOverlayOpen
		? Math.max(1, rootHeight - 3)
		: showLogPanel ? Math.max(1, logPaneHeight - 3) : 0;
	const maxLogScrollOffset = Math.max(0, logLineCount - logViewportHeight);
	const logScrollPageSize = Math.max(1, Math.floor((logViewportHeight || rootHeight) / 2));

	function moveSelection(nextIndex: number): void {
		const clampedIndex = clampSelectionIndex(nextIndex, model.rows.length);
		if (clampedIndex === null) {
			return;
		}
		setSelectedPath(model.rows[clampedIndex]!.path);
	}

	function clearTransientAlert(): void {
		if (alertTimeoutRef.current !== null) {
			clearTimeout(alertTimeoutRef.current);
			alertTimeoutRef.current = null;
		}
		setCompletedAlert(null);
	}

	function invalidateStaleLogRefreshes(): void {
		actionGenerationRef.current += 1;
	}


	async function apply(action: () => Promise<AppModel>) {
		invalidateStaleLogRefreshes();
		userActionInFlightRef.current = true;

		try {
			setModel(await action());
		} catch (error) {
			setModel(current => ({
				...current,
				status: {
					kind: 'error',
					message: error instanceof Error ? error.message : String(error),
				},
			}));
		} finally {
			userActionInFlightRef.current = false;
		}
	}

	useInput((input, key) => {
		if (isHelpOverlayOpen) {
			if (key.escape || input === '\u001B' || input === 'q' || input === '?') {
				setIsHelpOverlayOpen(false);
			}
			return;
		}
		if (isLogOverlayOpen) {
			if (input === '?') {
				setIsHelpOverlayOpen(true);
				return;
			}
			if (key.escape || input === 'q' || input === 'L') {
				setIsLogOverlayOpen(false);
				return;
			}
			if (key.upArrow || input === 'k') {
				setLogScrollOffset(current => Math.min(maxLogScrollOffset, current + 1));
				return;
			}
			if (key.downArrow || input === 'j') {
				setLogScrollOffset(current => Math.max(0, current - 1));
				return;
			}
			if (input === 'g') {
				setLogScrollOffset(maxLogScrollOffset);
				return;
			}
			if (input === 'G') {
				setLogScrollOffset(0);
				return;
			}
			if (input === '[' || key.pageUp) {
				setLogScrollOffset(current => Math.min(maxLogScrollOffset, current + logScrollPageSize));
				return;
			}
			if (input === ']' || key.pageDown) {
				setLogScrollOffset(current => Math.max(0, current - logScrollPageSize));
				return;
			}
			return;
		}
		if (confirmationOpen) {
			if (key.escape || input === '\u001B' || input === 'q' || input === 'n') {
				setPendingDelete(null);
				return;
			}
			if (input === 'd' || input === 'y') {
				const {path: worktreePath} = pendingDelete;
				setPendingDelete(null);
				clearTransientAlert();
				void apply(() => actions.deleteWorktree(worktreePath));
				return;
			}
			return;
		}
		if (key.escape || input === 'q') {
			exit();
			return;
		}
		if (key.upArrow || input === 'k') {
			moveSelection(selectedIndex - 1);
			return;
		}
		if (key.downArrow || input === 'j') {
			moveSelection(selectedIndex + 1);
			return;
		}
		if (input === 'g') {
			moveSelection(0);
			return;
		}
		if (input === 'G') {
			moveSelection(model.rows.length - 1);
			return;
		}
		if (input === '?') {
			setIsHelpOverlayOpen(true);
			return;
		}
		if (input === 'L') {
			setIsLogOverlayOpen(true);
			return;
		}
		if (input === ']') {
			setLogScrollOffset(current => Math.max(0, current - logScrollPageSize));
			return;
		}
		if (input === '[') {
			setLogScrollOffset(current => Math.min(maxLogScrollOffset, current + logScrollPageSize));
			return;
		}
		if (key.pageDown) {
			setSelectionScrollOffset(current => current + selectionScrollPageSize);
			return;
		}
		if (key.pageUp) {
			setSelectionScrollOffset(current => Math.max(0, current - selectionScrollPageSize));
			return;
		}
		if (userActionInFlightRef.current) {
			return;
		}
		if (key.return) {
			const decision = decideEnterInteraction(selected, model.activePath);
			if (decision.kind === 'ignore') {
				return;
			}
			if (decision.kind === 'set-status') {
				if (decision.suppressesBackgroundRefreshes) {
					invalidateStaleLogRefreshes();
				}
				setModel(current => ({...current, status: decision.status}));
				clearTransientAlert();
				return;
			}
			setModel(current => ({...current, status: decision.status}));
			clearTransientAlert();
			void apply(() => actions.start(decision.path));
			return;
		}
		if (input === 's') {
			setModel(current => ({...current, status: {kind: 'stopping', message: 'Stopping active session...'}}));
			clearTransientAlert();
			void apply(() => actions.stop());
			return;
		}
		if (input === 'i') {
			const decision = decideSetupInteraction(selected, model.setupAvailable);
			if (decision.kind === 'ignore') {
				return;
			}
			setModel(current => ({...current, status: decision.status}));
			clearTransientAlert();
			void apply(() => actions.setup(decision.path));
			return;
		}
		if (input === 'e' && selected && model.editorAvailable) {
			clearTransientAlert();
			void apply(() => actions.openEditor(selected.path));
			return;
		}
		if (input === 'o' && selected) {
			clearTransientAlert();
			void apply(() => actions.openPullRequest(selected.path));
			return;
		}
		if (input === 'd' && selected) {
			clearTransientAlert();
			setPendingDelete({path: selected.path, branch: selected.branch});
			return;
		}
		if (input === 'r') {
			clearTransientAlert();
			void apply(() => actions.refresh());
		}
	});

	const listPaneViewportHeight = paneHeight === undefined ? undefined : Math.max(1, paneHeight - 3);
	const mouseWheelLineStep = 3;
	const paneAreaLeft = 1;
	const worktreePaneRight = !stackedLayout ? paneAreaLeft + listWidth - 1 : undefined;
	const selectionPaneLeft = !stackedLayout && worktreePaneRight !== undefined ? worktreePaneRight + PANE_GAP_WIDTH + 1 : undefined;
	const bodyPaneTop = !stackedLayout && paneHeight !== undefined ? HEADER_HEIGHT + 1 : undefined;
	const bodyPaneBottom = !stackedLayout && bodyPaneTop !== undefined && paneHeight !== undefined ? bodyPaneTop + paneHeight - 1 : undefined;
	const stackedWorktreePaneTop = stackedLayout && paneHeight !== undefined ? HEADER_HEIGHT + 1 : undefined;
	const stackedWorktreePaneBottom = stackedLayout && stackedWorktreePaneTop !== undefined && paneHeight !== undefined ? stackedWorktreePaneTop + paneHeight - 1 : undefined;
	const stackedSelectionPaneTop = stackedLayout && stackedWorktreePaneBottom !== undefined ? stackedWorktreePaneBottom + 1 : undefined;
	const stackedSelectionPaneBottom = stackedLayout && stackedSelectionPaneTop !== undefined && paneHeight !== undefined ? stackedSelectionPaneTop + paneHeight - 1 : undefined;
	const logPaneTop = showLogPanel ? rootHeight - CONTEXT_BAR_HEIGHT - logPaneHeight + 1 : undefined;
	const logPaneBottom = showLogPanel ? rootHeight - CONTEXT_BAR_HEIGHT : undefined;

	useEffect(() => {
		const onData = (data: Buffer | string) => {
			if (isHelpOverlayOpen) {
				return;
			}

			const events = parseMouseWheelEvents(typeof data === 'string' ? data : data.toString('utf8'));
			for (const event of events) {
				if (isLogOverlayOpen) {
					setLogScrollOffset(current => Math.max(0, Math.min(maxLogScrollOffset, current - event.delta * mouseWheelLineStep)));
					continue;
				}

				const isLogPaneEvent = !isLogOverlayOpen
					&& showLogPanel
					&& event.y !== undefined
					&& logPaneTop !== undefined
					&& logPaneBottom !== undefined
					&& event.y >= logPaneTop
					&& event.y <= logPaneBottom;
				if (isLogPaneEvent) {
					setLogScrollOffset(current => Math.max(0, Math.min(maxLogScrollOffset, current - event.delta * mouseWheelLineStep)));
					continue;
				}

				const scrollWorktrees = () => {
					setWorktreeScrollOffset(current => {
						if (listPaneViewportHeight === undefined) {
							return 0;
						}
						const max = Math.max(0, model.rows.length - listPaneViewportHeight);
						return Math.max(0, Math.min(max, current + event.delta * mouseWheelLineStep));
					});
				};

				if (stackedLayout) {
					const isStackedWorktreeEvent = stackedWorktreePaneTop !== undefined
						&& stackedWorktreePaneBottom !== undefined
						&& event.y !== undefined
						&& event.y >= stackedWorktreePaneTop
						&& event.y <= stackedWorktreePaneBottom;
					if (isStackedWorktreeEvent) {
						scrollWorktrees();
						continue;
					}

					const isStackedSelectionEvent = stackedSelectionPaneTop !== undefined
						&& stackedSelectionPaneBottom !== undefined
						&& event.y !== undefined
						&& event.y >= stackedSelectionPaneTop
						&& event.y <= stackedSelectionPaneBottom;
					if (isStackedSelectionEvent) {
						setSelectionScrollOffset(current => Math.max(0, current + event.delta * mouseWheelLineStep));
					}
					continue;
				}

				const isBodyPaneEvent = bodyPaneTop !== undefined
					&& bodyPaneBottom !== undefined
					&& event.y !== undefined
					&& event.y >= bodyPaneTop
					&& event.y <= bodyPaneBottom;
				if (!isBodyPaneEvent) {
					continue;
				}

				const isSelectionPaneEvent = selectionPaneLeft !== undefined
					&& event.x !== undefined
					&& event.x >= selectionPaneLeft;
				if (isSelectionPaneEvent) {
					setSelectionScrollOffset(current => Math.max(0, current + event.delta * mouseWheelLineStep));
					continue;
				}

				const isWorktreePaneEvent = event.x === undefined
					|| worktreePaneRight === undefined
					|| event.x <= worktreePaneRight;
				if (isWorktreePaneEvent) {
					scrollWorktrees();
				}
			}
		};

		if (stdout.isTTY) {
			stdout.write(ENABLE_MOUSE_TRACKING);
		}
		stdin.on('data', onData);
		return () => {
			stdin.off('data', onData);
			if (stdout.isTTY) {
				stdout.write(DISABLE_MOUSE_TRACKING);
			}
		};
	}, [stdin, stdout, listWidth, stackedLayout, listPaneViewportHeight, mouseWheelLineStep, model.rows.length, showLogPanel, logPaneTop, logPaneBottom, maxLogScrollOffset, worktreePaneRight, selectionPaneLeft, bodyPaneTop, bodyPaneBottom, stackedWorktreePaneTop, stackedWorktreePaneBottom, stackedSelectionPaneTop, stackedSelectionPaneBottom, isLogOverlayOpen, isHelpOverlayOpen]);

	useEffect(() => {
		if (listPaneViewportHeight === undefined) {
			setWorktreeScrollOffset(0);
			return;
		}
		setWorktreeScrollOffset(current => {
			const max = Math.max(0, model.rows.length - listPaneViewportHeight);
			if (selectedIndex < current) {
				return Math.max(0, selectedIndex);
			}
			if (selectedIndex >= current + listPaneViewportHeight) {
				return Math.max(0, Math.min(max, selectedIndex - listPaneViewportHeight + 1));
			}
			return Math.min(current, max);
		});
	}, [selectedIndex, listPaneViewportHeight, model.rows.length]);

	useEffect(() => {
		if (!showLogPanel && !isLogOverlayOpen) {
			setLogScrollOffset(0);
			return;
		}
		setLogScrollOffset(current => Math.min(current, maxLogScrollOffset));
	}, [showLogPanel, isLogOverlayOpen, maxLogScrollOffset]);

	if (isHelpOverlayOpen) {
		return (
			<HelpWindow
				setupAvailable={model.setupAvailable}
				editorAvailable={model.editorAvailable}
				width={Math.max(1, rootWidth - 1)}
				height={rootHeight}
			/>
		);
	}

	if (isLogOverlayOpen) {
		return (
			<FloatingLogWindow
				logs={model.logs}
				width={Math.max(1, rootWidth - 1)}
				height={rootHeight}
				scrollOffset={logScrollOffset}
			/>
		);
	}

	if (minimalLayout) {
		return (
			<Box width={rootWidth} height={rootHeight} flexDirection="column">
				<Text bold color="green" wrap="truncate-end">
					A:{model.activeBranch ?? '-'}
				</Text>
				{rootHeight >= 2 ? <Text wrap="truncate-end">S:{selected?.branch ?? '-'}</Text> : null}
				{rootHeight >= 3 ? <Text wrap="truncate-end">{confirmationOpen ? `D:${visibleStatus.message}` : `T:${model.status.kind}`}</Text> : null}
				{rootHeight >= 4 ? (
					confirmationOpen
						? <Text dimColor wrap="truncate-end">d/y confirm · Esc/n/q cancel</Text>
						: <Text dimColor wrap="truncate-end">↑↓jk↵{model.setupAvailable ? 'i' : ''}{model.editorAvailable ? 'e' : ''}odLq</Text>
				) : null}
			</Box>
		);
	}

	if (compactLayout) {
		return (
			<Box width={rootWidth} height={rootHeight} flexDirection="column">
				<Text bold color="green" wrap="truncate-end">
					Active: {model.activeBranch ?? '-'}
				</Text>
				<Text wrap="truncate-end">Selected: {selected?.branch ?? '-'}</Text>
				{completedAlert
					? <Text color="green" wrap="truncate-end">✔ {completedAlert}</Text>
					: model.status.kind === 'setting-up' || model.status.kind === 'starting' || model.status.kind === 'stopping' ? (
						<Spinner label={`Status: ${model.status.kind} — ${model.status.message}`} />
					) : (
						<Text wrap="truncate-end">Status: {visibleStatus.kind} — {visibleStatus.message}</Text>
					)}
				<Text dimColor wrap="truncate-end">
					{confirmationOpen
						? 'Keys: d/y confirm | Esc/n/q cancel'
						: `Keys: ↑↓/jk g/G ↵${model.setupAvailable ? ' i' : ''}${model.editorAvailable ? ' e' : ''} o d L s r q · Resize terminal for split view`}
				</Text>
			</Box>
		);
	}

	return (
		<Box width={rootWidth} height={rootHeight} flexDirection="column">
			<Header repoName={model.repoName} namespace={model.namespace} activeBranch={model.activeBranch} />
			<Box flexDirection={stackedLayout ? 'column' : 'row'} flexGrow={stackedLayout ? 0 : 1} flexShrink={1}>
				<WorktreeList
					rows={model.rows}
					selectedIndex={selectedIndex}
					width={stackedLayout ? bodyWidth : listWidth}
					height={paneHeight}
					stacked={stackedLayout}
					scrollOffset={worktreeScrollOffset}
				/>
				<ActionPanel selectedRow={selected} activePath={model.activePath} setupAvailable={model.setupAvailable} stacked={stackedLayout} width={stackedLayout ? bodyWidth : actionWidth} height={paneHeight} compactDetails={compactDetailPane} scrollOffset={selectionScrollOffset} />
			</Box>
			{showLogPanel ? <LogPanel logs={model.logs} width={bodyWidth} height={logPaneHeight} scrollOffset={logScrollOffset} /> : null}
			<ContextBar status={visibleStatus} setupAvailable={model.setupAvailable} editorAvailable={model.editorAvailable} confirmationOpen={confirmationOpen} />
			{completedAlert ? (
				<Box position="absolute" top={1} right={2}>
					<Alert variant="success">{completedAlert}</Alert>
				</Box>
			) : null}
		</Box>
	);
}
