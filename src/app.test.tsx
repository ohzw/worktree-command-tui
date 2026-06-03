import React from 'react';
import {render} from 'ink-testing-library';
import {expect, it, vi} from 'vitest';
import {App, getShellDimensions, shouldStackPanes, shouldUseCompactLayout, shouldUseMinimalLayout} from './app.js';
import type {AppActions, AppModel, RowTag} from './core/runtime.js';
import {APP_RENDER_OPTIONS} from './render-options.js';

function makeFakeActions(result: AppModel): AppActions {
	return {
		start: vi.fn(async () => result),
		stop: vi.fn(async () => result),
		refresh: vi.fn(async () => result),
	};
}

function createModel(overrides: Partial<AppModel> = {}): AppModel {
	return {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: ['active']},
			{path: '/repo-other', shortPath: '/repo-other', branch: 'fix/x', tags: ['external']},
		],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
		status: {kind: 'idle', message: 'ready'},
		...overrides,
	};
}

async function waitForInput(): Promise<void> {
	const {promise, resolve} = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

it('uses alternate screen render options', () => {
	expect(APP_RENDER_OPTIONS).toEqual({alternateScreen: true, exitOnCtrlC: true});
});

it('never grows the shell beyond the available terminal viewport', () => {
	expect(getShellDimensions(8, 8)).toEqual({rootWidth: 8, rootHeight: 8, bodyWidth: 4, listWidth: 1, actionWidth: 2});
	expect(getShellDimensions(45, 12)).toEqual({rootWidth: 45, rootHeight: 12, bodyWidth: 41, listWidth: 13, actionWidth: 27});
	expect(getShellDimensions(100, 30)).toEqual({rootWidth: 100, rootHeight: 30, bodyWidth: 96, listWidth: 32, actionWidth: 63});
});

it('switches to compact, stacked, and minimal layouts at the expected breakpoints', () => {
	expect(shouldUseMinimalLayout(8, 4)).toBe(true);
	expect(shouldUseMinimalLayout(30, 8)).toBe(false);
	expect(shouldUseCompactLayout(30, 8, 1)).toBe(true);
	expect(shouldUseCompactLayout(50, 16, 10)).toBe(true);
	expect(shouldUseCompactLayout(72, 20, 10)).toBe(true);
	expect(shouldUseCompactLayout(90, 22, 3)).toBe(true);
	expect(shouldUseCompactLayout(120, 30, 3)).toBe(false);
	expect(shouldStackPanes(90, 24, 3)).toBe(false);
	expect(shouldStackPanes(90, 30, 3)).toBe(true);
	expect(shouldStackPanes(120, 30, 3)).toBe(false);
});

it('renders colored pane labels and active marker in the main layout', () => {
	const model = createModel();
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />,
	);
	expect(lastFrame()).toContain('Worktree Command TUI · Repo: reclaim-the-forest');
	expect(lastFrame()).toContain('Active: feat/a');
	expect(lastFrame()).toContain('Namespace: rojo-serve');
	expect(lastFrame()).toContain('Worktrees');
	expect(lastFrame()).toContain('Selection / Action');
	expect(lastFrame()).toContain('Status: idle — ready');
	expect(lastFrame()).toContain('Keys: ↑↓/jk move  g/G first/last  Enter start/switch  s stop  r refresh  q quit');
	expect(lastFrame()).toContain('* feat/a');
});

it('keeps the selection pane width stable across selected worktrees', () => {
	const shortModel = createModel({
		rows: [
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
		],
		activePath: null,
		activeBranch: null,
	});
	const longModel = createModel({
		rows: [
			{
				path: '/repo/.worktree/long',
				shortPath: '.worktree/long',
				branch: 'feature/this-is-a-very-long-branch-name-that-should-not-move-the-pane',
				tags: [],
			},
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
		],
		activePath: null,
		activeBranch: null,
	});
	const shortFrame = render(<App initialModel={shortModel} actions={makeFakeActions(shortModel)} windowSizeOverride={{columns: 120, rows: 30}} />).lastFrame() ?? '';
	const longFrame = render(<App initialModel={longModel} actions={makeFakeActions(longModel)} windowSizeOverride={{columns: 120, rows: 30}} />).lastFrame() ?? '';
	const shortTitleLine = shortFrame.split('\n').find(line => line.includes('Selection / Action')) ?? '';
	const longTitleLine = longFrame.split('\n').find(line => line.includes('Selection / Action')) ?? '';
	expect(shortTitleLine.indexOf('Selection / Action')).toBe(longTitleLine.indexOf('Selection / Action'));
});

it('stacks panes responsively on medium-width terminals', () => {
	const model = createModel();
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 90, rows: 30}} />,
	);
	expect(lastFrame()).toContain('Worktrees');
	expect(lastFrame()).toContain('Selection / Action');
	expect(lastFrame()).toContain('> # develop');
});
it('uses split layout when the stacked breakpoint no longer applies', () => {
	const manyRows: AppModel['rows'] = Array.from({length: 10}, (_, index) => ({
		path: `/repo/.worktree/feat-${index}`,
		shortPath: `.worktree/feat-${index}`,
		branch: `feat/${index}`,
		tags: (index === 0 ? ['active'] : []) as RowTag[],
	}));
	const model = createModel({rows: manyRows, activePath: '/repo/.worktree/feat-0', activeBranch: 'feat/0'});
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 90, rows: 26}} />,
	);
	expect(lastFrame()).toContain('Selection / Action');
	expect(lastFrame()).toContain('Status: idle — ready');
});

it('renders a compact fallback shell on short terminals', () => {
	const model = createModel({rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}], activePath: '/repo', activeBranch: 'develop'});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 30, rows: 8}} />);
	expect(lastFrame()).toContain('Active: develop');
	expect(lastFrame()).toContain('Selected: develop');
	expect(lastFrame()).toContain('Status: idle — ready');
	expect(lastFrame()).toContain('Keys: ↑↓/jk g/G ↵ s r q');
});

it('renders a minimal fallback shell on extremely small terminals', () => {
	const model = createModel({rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}], activePath: '/repo', activeBranch: 'develop'});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 8, rows: 4}} />);
	expect(lastFrame()).toContain('A:devel…');
	expect(lastFrame()).toContain('S:devel…');
	expect(lastFrame()).toContain('T:idle');
	expect(lastFrame()).toContain('↑↓jk↵q');
});

it('keeps the active branch visible when header metadata is long', () => {
	const model = createModel({
		repoName: 'reclaim-the-forest-with-a-long-name',
		namespace: 'rojo-serve-with-a-long-namespace',
		rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}],
		activePath: '/repo',
		activeBranch: 'feature/this-is-a-very-long-branch-name-that-should-still-be-visible',
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Active: feature/this-is-a-very-long-branch-name-that-should-still-be-visible');
});

it('truncates long branch labels in the worktree pane', () => {
	const model = createModel({
		rows: [{path: '/repo/long', shortPath: '.worktree/long', branch: 'feature/this-is-a-very-long-branch-name-that-wraps', tags: []}],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('feature/this-is-a-very-long-br…');
});

it('truncates long branch and path values in the selection pane', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feature/this/is/a/very/long/path/that/keeps/going/until/the/panel/would/wrap',
			shortPath: '.worktree/feature/long',
			branch: 'feature/this-is-a-very-long-branch-name-that-wraps-and-keeps-going-past-the-panel-width',
			tags: [],
		}],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Branch: feature/this-is-a-very-long-branch-name-that-wraps-and-keeps-go…');
	expect(lastFrame()).toContain('Path: /repo/.worktree/feature/this/is/a/very/long/path/that/keeps/going…');
});

it('shows invalid reason in the detail pane before start is attempted', () => {
	const model = createModel({
		rows: [{path: '/bad', shortPath: '/bad', branch: 'fix/bad', tags: ['invalid'], invalidReason: 'Missing required files: default.project.json'}],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Cannot start this worktree.');
	expect(lastFrame()).toContain('Notes: Missing required files: default.project.json');
});

it('supports vim-style movement keys', async () => {
	const model = createModel({
		rows: [
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
			{path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b', tags: []},
		],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame, stdin} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('j');
	await waitForInput();
	expect(lastFrame()).toContain('Branch: feat/a');
	stdin.write('G');
	await waitForInput();
	expect(lastFrame()).toContain('Branch: feat/b');
	stdin.write('g');
	await waitForInput();
	expect(lastFrame()).toContain('Branch: develop');
	stdin.write('j');
	await waitForInput();
	stdin.write('k');
	await waitForInput();
	expect(lastFrame()).toContain('Branch: develop');
});

it('shows invalid reason instead of starting when enter is pressed on invalid worktree', async () => {
	const model = createModel({
		rows: [{path: '/bad', shortPath: '/bad', branch: 'fix/bad', tags: ['invalid'], invalidReason: 'Missing required files: default.project.json'}],
		activePath: null,
		activeBranch: null,
	});
	const start = vi.fn();
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('\r');
	await waitForInput();
	expect(start).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('Missing required files: default.project.json');
});

it('keeps the same worktree selected when start reorders the list', async () => {
	const initial = createModel({
		rows: [
			{path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b', tags: []},
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
		],
		activePath: null,
		activeBranch: null,
	});
	const reordered = createModel({
		rows: [
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b', tags: ['active']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
		],
		activePath: '/repo/.worktree/feat-b',
		activeBranch: 'feat/b',
		status: {kind: 'running', message: 'started feat/b'},
	});
	const {lastFrame, stdin} = render(<App initialModel={initial} actions={{...makeFakeActions(reordered), start: vi.fn(async () => reordered)}} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('\r');
	await waitForInput();
	expect(lastFrame()).toContain('Active: feat/b');
	expect(lastFrame()).toContain('Path: /repo/.worktree/feat-b');
	expect(lastFrame()).toContain('Action: Already active. Press s to stop the current session.');
});

it('converts start failures into error status instead of crashing the app', async () => {
	const model = createModel({
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
	});
	const start = vi.fn().mockRejectedValue(
		new Error('spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-until-it-wraps-across-multiple-columns-and-pushes-the-footer-down.log'),
	);
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('\r');
	await waitForInput();
	await waitForInput();
	expect(lastFrame()).toContain('Status: error — spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-until-it-wraps-across-…');
});

it('treats selecting the already-active worktree as a no-op refresh', async () => {
	const model = createModel({
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: ['active']}],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
	});
	const start = vi.fn();
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('\r');
	await waitForInput();
	expect(start).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('already active');
});

it('ignores repeated enter presses while start is already in flight', async () => {
	const model = createModel({
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
	});
	const deferred = Promise.withResolvers<AppModel>();
	const start = vi.fn(async () => deferred.promise);
	const {stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} windowSizeOverride={{columns: 120, rows: 30}} />);
	stdin.write('\r');
	stdin.write('\r');
	await waitForInput();
	expect(start).toHaveBeenCalledTimes(1);
	deferred.resolve({...model, status: {kind: 'running', message: 'started feat/a'}});
	await waitForInput();
});
