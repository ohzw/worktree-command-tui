import type {AppRow, AppStatus} from './runtime.js';

export type EnterInteractionDecision =
	| {kind: 'ignore'}
	| {kind: 'set-status'; status: AppStatus; suppressesBackgroundRefreshes: true}
	| {kind: 'start'; path: string; status: AppStatus};

export type SetupInteractionDecision =
	| {kind: 'ignore'}
	| {kind: 'setup'; path: string; status: AppStatus};

export interface AsyncInteractionState {
	generation: number;
	currentGeneration: number;
	userActionInFlight: boolean;
	blocksInput: boolean;
}

export function getNextSelectedPath(rows: readonly AppRow[], currentPath: string | null): string | null {
	if (rows.length === 0) {
		return null;
	}
	if (currentPath && rows.some(row => row.path === currentPath)) {
		return currentPath;
	}
	return rows[0]!.path;
}

export function getSelectedIndex(rows: readonly AppRow[], selectedPath: string | null): number {
	if (selectedPath === null) {
		return 0;
	}
	const foundIndex = rows.findIndex(row => row.path === selectedPath);
	return foundIndex >= 0 ? foundIndex : 0;
}

export function clampSelectionIndex(nextIndex: number, rowCount: number): number | null {
	if (rowCount <= 0) {
		return null;
	}
	return Math.min(Math.max(nextIndex, 0), rowCount - 1);
}

export function wrapSelectionIndex(nextIndex: number, rowCount: number): number | null {
	if (rowCount <= 0) {
		return null;
	}
	return ((nextIndex % rowCount) + rowCount) % rowCount;
}

export function decideEnterInteraction(selected: AppRow | undefined, activePath: string | null): EnterInteractionDecision {
	if (selected === undefined) {
		return {kind: 'ignore'};
	}
	if (selected.invalidReason) {
		return {
			kind: 'set-status',
			status: {kind: 'error', message: selected.invalidReason},
			suppressesBackgroundRefreshes: true,
		};
	}
	if (selected.path === activePath) {
		return {
			kind: 'start',
			path: selected.path,
			status: {kind: 'starting', message: `Restarting ${selected.branch}...`},
		};
	}
	return {
		kind: 'start',
		path: selected.path,
		status: {kind: 'starting', message: `Starting ${selected.branch}...`},
	};
}

export function decideSetupInteraction(selected: AppRow | undefined, setupAvailable: boolean): SetupInteractionDecision {
	if (selected === undefined || !setupAvailable) {
		return {kind: 'ignore'};
	}
	return {
		kind: 'setup',
		path: selected.path,
		status: {kind: 'setting-up', message: `Running setup for ${selected.branch}...`},
	};
}

export function shouldApplyAsyncResult(state: AsyncInteractionState): boolean {
	return state.blocksInput || (state.generation === state.currentGeneration && !state.userActionInFlight);
}
