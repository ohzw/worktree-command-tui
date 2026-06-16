import {describe, expect, it} from 'vitest';
import {
	clampSelectionIndex,
	getNextSelectedPath,
	getSelectedIndex,
	shouldApplyAsyncResult,
	decideEnterInteraction,
	decideSetupInteraction,
	type AsyncInteractionState,
} from './tui-interaction.js';
import type {AppRow} from './runtime.js';

function makeRow(overrides: Partial<AppRow> = {}): AppRow {
	return {
		path: '/repo/.worktree/feat-a',
		shortPath: '.worktree/feat-a',
		branch: 'feat/a',
		tags: [],
		...overrides,
	};
}

const rows = [
	makeRow({path: '/repo', shortPath: '.', branch: 'develop'}),
	makeRow({path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a'}),
	makeRow({path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b'}),
] as const;

describe('selection decisions', () => {
	it('preserves the selected path across reordered rows and falls back to the first row', () => {
		expect(getNextSelectedPath(rows, '/repo/.worktree/feat-b')).toBe('/repo/.worktree/feat-b');
		expect(getNextSelectedPath(rows, '/missing')).toBe('/repo');
		expect(getNextSelectedPath([], '/repo')).toBeNull();
		expect(getSelectedIndex(rows, '/repo/.worktree/feat-a')).toBe(1);
		expect(getSelectedIndex(rows, '/missing')).toBe(0);
	});

	it('clamps movement to available rows without inventing a selection for an empty list', () => {
		expect(clampSelectionIndex(-1, rows.length)).toBe(0);
		expect(clampSelectionIndex(99, rows.length)).toBe(2);
		expect(clampSelectionIndex(0, 0)).toBeNull();
	});
});

describe('enter and setup decisions', () => {
	it('returns status decisions for invalid worktrees before restart decisions', () => {
		expect(decideEnterInteraction(makeRow({invalidReason: 'Missing required files'}), null)).toEqual({
			kind: 'set-status',
			status: {kind: 'error', message: 'Missing required files'},
			suppressesBackgroundRefreshes: true,
		});
		expect(decideEnterInteraction(makeRow({path: '/repo', invalidReason: 'Still invalid'}), '/repo')).toEqual({
			kind: 'set-status',
			status: {kind: 'error', message: 'Still invalid'},
			suppressesBackgroundRefreshes: true,
		});
		expect(decideEnterInteraction(makeRow({path: '/repo', branch: 'develop'}), '/repo')).toEqual({
			kind: 'start',
			path: '/repo',
			status: {kind: 'starting', message: 'Restarting develop...'},
		});
	});

	it('returns command decisions for startable rows and configured setup only', () => {
		expect(decideEnterInteraction(rows[1], '/repo')).toEqual({
			kind: 'start',
			path: '/repo/.worktree/feat-a',
			status: {kind: 'starting', message: 'Starting feat/a...'},
		});
		expect(decideSetupInteraction(rows[1], true)).toEqual({
			kind: 'setup',
			path: '/repo/.worktree/feat-a',
			status: {kind: 'setting-up', message: 'Running setup for feat/a...'},
		});
		expect(decideEnterInteraction(undefined, '/repo')).toEqual({kind: 'ignore'});
		expect(decideSetupInteraction(rows[1], false)).toEqual({kind: 'ignore'});
		expect(decideSetupInteraction(undefined, true)).toEqual({kind: 'ignore'});
	});
});

describe('async refresh suppression decisions', () => {
	it('accepts background results only for the current generation while input is idle', () => {
		const idle: AsyncInteractionState = {generation: 3, currentGeneration: 3, userActionInFlight: false, blocksInput: false};
		expect(shouldApplyAsyncResult(idle)).toBe(true);
		expect(shouldApplyAsyncResult({...idle, generation: 2})).toBe(false);
		expect(shouldApplyAsyncResult({...idle, userActionInFlight: true})).toBe(false);
		expect(shouldApplyAsyncResult({...idle, blocksInput: true, generation: 2, userActionInFlight: true})).toBe(true);
		expect(shouldApplyAsyncResult({...idle, blocksInput: true, generation: 2, userActionInFlight: false})).toBe(true);
	});
});
