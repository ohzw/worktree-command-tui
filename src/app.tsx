import {Alert, Spinner} from '@inkjs/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdin, useStdout, useWindowSize} from 'ink';
import {ActionPanel} from './components/ActionPanel.js';
import {ContextBar} from './components/ContextBar.js';
import {Header} from './components/Header.js';
import {WorktreeList} from './components/WorktreeList.js';
import type {AppActions, AppModel, AppStatus} from './core/runtime.js';

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

export function getMouseWheelDelta(input: string): number {
	let delta = 0;
	const sgrMousePattern = /\u001B\[<(\d+);\d+;\d+[mM]/g;
	for (const match of input.matchAll(sgrMousePattern)) {
		const button = Number(match[1]);
		if (button === 64) {
			delta -= 1;
		}
		if (button === 65) {
			delta += 1;
		}
	}
	return delta;
}

function getNextSelectedPath(rows: AppModel['rows'], currentPath: string | null): string | null {
	if (rows.length === 0) {
		return null;
	}
	if (currentPath && rows.some(row => row.path === currentPath)) {
		return currentPath;
	}
	return rows[0]!.path;
}

export function getShellDimensions(columns: number, rows: number): ShellDimensions {
	const rootWidth = Math.max(columns, 1);
	const rootHeight = Math.max(rows, 1);
	const bodyWidth = Math.max(rootWidth - 4, 1);
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

export function shouldStackPanes(columns: number, rows: number, worktreeCount = 0): boolean {
	// Stacked panes are taller than split panes. Only use them when the full frame can fit the viewport.
	const minimumRows = Math.max(36, worktreeCount + 34);
	return columns < 96 && rows >= minimumRows;
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
	const [completedAlert, setCompletedAlert] = useState<string | null>(null);
	const inFlightRef = useRef(false);
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

	useEffect(() => {
		const onData = (data: Buffer | string) => {
			const wheelDelta = getMouseWheelDelta(typeof data === 'string' ? data : data.toString('utf8'));
			if (wheelDelta !== 0) {
				setSelectionScrollOffset(current => Math.max(0, current + wheelDelta * 3));
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
	}, [stdin, stdout]);

	const selectedIndex = useMemo(() => {
		if (selectedPath === null) {
			return 0;
		}
		const foundIndex = model.rows.findIndex(row => row.path === selectedPath);
		return foundIndex >= 0 ? foundIndex : 0;
	}, [model.rows, selectedPath]);
	const selected = model.rows[selectedIndex];
	const {rootWidth, rootHeight, bodyWidth, listWidth, actionWidth} = getShellDimensions(columns, rows);
	const minimalLayout = shouldUseMinimalLayout(rootWidth, rootHeight);
	const compactLayout = !minimalLayout && shouldUseCompactLayout(rootWidth, rootHeight, model.rows.length);
	const stackedLayout = !minimalLayout && !compactLayout && shouldStackPanes(rootWidth, rootHeight, model.rows.length);
	const compactDetailPane = !stackedLayout && rootHeight <= 30 && model.rows.length > 1;
	const paneHeight = stackedLayout ? undefined : Math.max(3, rootHeight - 11);
	const selectionScrollPageSize = Math.max(1, Math.floor((paneHeight ?? rootHeight) / 2));

	function moveSelection(nextIndex: number): void {
		if (model.rows.length === 0) {
			return;
		}
		setSelectedPath(model.rows[Math.min(Math.max(nextIndex, 0), model.rows.length - 1)]!.path);
	}

	function clearTransientAlert(): void {
		if (alertTimeoutRef.current !== null) {
			clearTimeout(alertTimeoutRef.current);
			alertTimeoutRef.current = null;
		}
		setCompletedAlert(null);
	}

	async function apply(action: () => Promise<AppModel>) {
		inFlightRef.current = true;
		try {
			const next = await action();
			setModel(next);
		} catch (error) {
			setModel(current => ({
				...current,
				status: {
					kind: 'error',
					message: error instanceof Error ? error.message : String(error),
				},
			}));
		} finally {
			inFlightRef.current = false;
		}
	}

	useInput((input, key) => {
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
		if (key.pageDown) {
			setSelectionScrollOffset(current => current + selectionScrollPageSize);
			return;
		}
		if (key.pageUp) {
			setSelectionScrollOffset(current => Math.max(0, current - selectionScrollPageSize));
			return;
		}
		if (inFlightRef.current) {
			return;
		}
		if (key.return && selected) {
			if (selected.invalidReason) {
				setModel(current => ({...current, status: {kind: 'error', message: selected.invalidReason!}}));
				clearTransientAlert();
				return;
			}
			if (selected.path === model.activePath) {
				setModel(current => ({...current, status: {kind: 'idle', message: 'already active'}}));
				clearTransientAlert();
				return;
			}
			setModel(current => ({...current, status: {kind: 'starting', message: `Starting ${selected.branch}...`}}));
			clearTransientAlert();
			void apply(() => actions.start(selected.path));
			return;
		}
		if (input === 's') {
			setModel(current => ({...current, status: {kind: 'stopping', message: 'Stopping active session...'}}));
			clearTransientAlert();
			void apply(() => actions.stop());
			return;
		}
		if (input === 'r') {
			clearTransientAlert();
			void apply(() => actions.refresh());
		}
	});

	if (minimalLayout) {
		return (
			<Box width={rootWidth} height={rootHeight} flexDirection="column">
				<Text bold color="green" wrap="truncate-end">
					A:{model.activeBranch ?? '-'}
				</Text>
				{rootHeight >= 2 ? <Text wrap="truncate-end">S:{selected?.branch ?? '-'}</Text> : null}
				{rootHeight >= 3 ? <Text wrap="truncate-end">T:{model.status.kind}</Text> : null}
				{rootHeight >= 4 ? <Text dimColor wrap="truncate-end">↑↓jk↵q</Text> : null}
			</Box>
		);
	}

	if (compactLayout) {
		return (
			<Box width={rootWidth} height={rootHeight} borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
				<Text bold color="green" wrap="truncate-end">
					Active: {model.activeBranch ?? '-'}
				</Text>
				<Text wrap="truncate-end">Selected: {selected?.branch ?? '-'}</Text>
				{completedAlert
					? <Text color="green" wrap="truncate-end">✔ {completedAlert}</Text>
					: model.status.kind === 'starting' || model.status.kind === 'stopping' ? (
						<Spinner label={`Status: ${model.status.kind} — ${model.status.message}`} />
					) : (
						<Text wrap="truncate-end">Status: {model.status.kind} — {model.status.message}</Text>
					)}
				<Text dimColor wrap="truncate-end">
					Keys: ↑↓/jk g/G ↵ s r q · Resize terminal for split view
				</Text>
			</Box>
		);
	}

	return (
		<Box width={rootWidth} height={rootHeight} borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
			<Header repoName={model.repoName} namespace={model.namespace} activeBranch={model.activeBranch} />
			<Box flexDirection={stackedLayout ? 'column' : 'row'} flexGrow={stackedLayout ? 0 : 1} flexShrink={1}>
				<WorktreeList rows={model.rows} selectedIndex={selectedIndex} width={stackedLayout ? bodyWidth : listWidth} height={paneHeight} stacked={stackedLayout} />
				<ActionPanel selectedRow={selected} activePath={model.activePath} stacked={stackedLayout} width={stackedLayout ? bodyWidth : actionWidth} height={paneHeight} compactDetails={compactDetailPane} scrollOffset={selectionScrollOffset} />
			</Box>
			<ContextBar status={model.status} />
			{completedAlert ? (
				<Box position="absolute" top={1} right={2}>
					<Alert variant="success">{completedAlert}</Alert>
				</Box>
			) : null}
		</Box>
	);
}
