import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {ActionPanel} from './components/ActionPanel.js';
import {ContextBar} from './components/ContextBar.js';
import {Header} from './components/Header.js';
import {WorktreeList} from './components/WorktreeList.js';
import type {AppActions, AppModel} from './core/runtime.js';

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

export function shouldUseCompactLayout(columns: number, rows: number, worktreeCount = 0): boolean {
	const contentAwareRowFloor = Math.max(20, worktreeCount + 12);
	return columns < 72 || rows <= contentAwareRowFloor || (columns < 96 && rows < 24);
}

export function shouldUseMinimalLayout(columns: number, rows: number): boolean {
	return columns < 20 || rows < 6;
}

export function shouldStackPanes(columns: number, rows: number, worktreeCount = 0): boolean {
	const minimumRows = Math.max(26, worktreeCount + 18);
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
	const liveWindowSize = useWindowSize();
	const {columns, rows} = windowSizeOverride ?? liveWindowSize;
	const [model, setModel] = useState(initialModel);
	const [selectedPath, setSelectedPath] = useState<string | null>(initialModel.rows[0]?.path ?? null);
	const inFlightRef = useRef(false);

	useEffect(() => {
		setSelectedPath(currentPath => getNextSelectedPath(model.rows, currentPath));
	}, [model.rows]);

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

	function moveSelection(nextIndex: number): void {
		if (model.rows.length === 0) {
			return;
		}
		setSelectedPath(model.rows[Math.min(Math.max(nextIndex, 0), model.rows.length - 1)]!.path);
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
		if (inFlightRef.current) {
			return;
		}
		if (key.return && selected) {
			if (selected.invalidReason) {
				setModel(current => ({...current, status: {kind: 'error', message: selected.invalidReason!}}));
				return;
			}
			if (selected.path === model.activePath) {
				setModel(current => ({...current, status: {kind: 'idle', message: 'already active'}}));
				return;
			}
			setModel(current => ({...current, status: {kind: 'starting', message: `Starting ${selected.branch}...`}}));
			void apply(() => actions.start(selected.path));
			return;
		}
		if (input === 's') {
			setModel(current => ({...current, status: {kind: 'stopping', message: 'Stopping active session...'}}));
			void apply(() => actions.stop());
			return;
		}
		if (input === 'r') {
			void apply(() => actions.refresh());
		}
	});

	if (minimalLayout) {
		return (
			<Box width={rootWidth} flexDirection="column">
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
			<Box width={rootWidth} borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
				<Text bold color="green" wrap="truncate-end">
					Active: {model.activeBranch ?? '-'}
				</Text>
				<Text wrap="truncate-end">Selected: {selected?.branch ?? '-'}</Text>
				<Text wrap="truncate-end">Status: {model.status.kind} — {model.status.message}</Text>
				<Text dimColor wrap="truncate-end">
					Keys: ↑↓/jk g/G ↵ s r q · Resize terminal for split view
				</Text>
			</Box>
		);
	}

	return (
		<Box width={rootWidth} height={stackedLayout ? undefined : rootHeight} borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
			<Header repoName={model.repoName} namespace={model.namespace} activeBranch={model.activeBranch} />
			<Box flexDirection={stackedLayout ? 'column' : 'row'} flexGrow={stackedLayout ? 0 : 1} flexShrink={1}>
				<WorktreeList rows={model.rows} selectedIndex={selectedIndex} width={stackedLayout ? bodyWidth : listWidth} stacked={stackedLayout} />
				<ActionPanel selectedRow={selected} activePath={model.activePath} stacked={stackedLayout} width={stackedLayout ? bodyWidth : actionWidth} />
			</Box>
			<ContextBar status={model.status} />
		</Box>
	);
}
