import React from 'react';
import {render} from 'ink-testing-library';
import {expect, it, vi} from 'vitest';
import {App, getMouseWheelDelta, getShellDimensions, shouldStackPanes, shouldUseCompactLayout, shouldUseMinimalLayout} from './app.js';
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

it('uses alternate screen and incremental rendering options', () => {
	expect(APP_RENDER_OPTIONS).toEqual({alternateScreen: true, exitOnCtrlC: true, incrementalRendering: true});
});

it('never grows the shell beyond the available terminal viewport', () => {
	expect(getShellDimensions(8, 8)).toEqual({rootWidth: 8, rootHeight: 8, bodyWidth: 4, listWidth: 1, actionWidth: 2});
	expect(getShellDimensions(45, 12)).toEqual({rootWidth: 45, rootHeight: 12, bodyWidth: 41, listWidth: 13, actionWidth: 27});
	expect(getShellDimensions(100, 30)).toEqual({rootWidth: 100, rootHeight: 30, bodyWidth: 96, listWidth: 32, actionWidth: 63});
});

it('parses SGR mouse wheel events', () => {
	expect(getMouseWheelDelta('\u001B[<64;10;5M')).toBe(-1);
	expect(getMouseWheelDelta('\u001B[<65;10;5M')).toBe(1);
	expect(getMouseWheelDelta('\u001B[<65;10;5M\u001B[<65;10;5M')).toBe(2);
	expect(getMouseWheelDelta('x')).toBe(0);
});

it('renders one fullscreen frame for each responsive layout', () => {
	const model = createModel();
	for (const windowSizeOverride of [
		{columns: 8, rows: 4},
		{columns: 30, rows: 8},
		{columns: 90, rows: 30},
		{columns: 90, rows: 40},
		{columns: 120, rows: 30},
	]) {
		const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={windowSizeOverride} />);
		expect((lastFrame() ?? '').split('\n')).toHaveLength(windowSizeOverride.rows);
	}
});

it('switches to stacked and minimal layouts at the expected breakpoints', () => {
	expect(shouldUseMinimalLayout(8, 4)).toBe(true);
	expect(shouldUseMinimalLayout(30, 8)).toBe(true);
	expect(shouldUseMinimalLayout(30, 12)).toBe(false);
	expect(shouldUseCompactLayout(30, 8, 1)).toBe(false);
	expect(shouldUseCompactLayout(50, 16, 10)).toBe(false);
	expect(shouldUseCompactLayout(72, 20, 10)).toBe(false);
	expect(shouldUseCompactLayout(90, 22, 3)).toBe(false);
	expect(shouldUseCompactLayout(30, 30, 1)).toBe(false);
	expect(shouldUseCompactLayout(120, 30, 3)).toBe(false);
	expect(shouldStackPanes(90, 30, 3)).toBe(false);
	expect(shouldStackPanes(90, 40, 3)).toBe(true);
	expect(shouldStackPanes(120, 40, 3)).toBe(false);
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
	expect(lastFrame()).toContain('idle');
	expect(lastFrame()).toContain('Wheel/PgUp/PgDn selection scroll');
	expect(lastFrame()).toContain('* feat/a');
});

it('keeps the pane layout on narrow terminals when vertical space is available', () => {
	const model = createModel();
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 70, rows: 30}} />,
	);
	expect(lastFrame()).toContain('Worktrees');
	expect(lastFrame()).toContain('Selection');
	expect(lastFrame()).not.toContain('Resize terminal for split view');
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

it('stacks panes responsively on medium-width terminals when there is enough vertical space', () => {
	const model = createModel();
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 90, rows: 40}} />,
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
		pullRequest: index === 0 ? {kind: 'found', number: 2125, title: 'Selection pane metadata', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: true, baseBranch: 'develop'} : undefined,
	}));
	const model = createModel({rows: manyRows, activePath: '/repo/.worktree/feat-0', activeBranch: 'feat/0'});
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 90, rows: 26}} />,
	);
	expect(lastFrame()).toContain('[Action]');
	expect(lastFrame()).not.toContain('Full Path:');
	expect(lastFrame()).not.toContain('Tags:');
	expect(lastFrame()).not.toContain('PR Title:');
});
it('keeps rich detail rows on medium split terminals', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: ['active'],
			headSha: '46af3f1c',
			upstream: {branch: 'origin/develop', ahead: 4, behind: 24},
			workingTree: {staged: 1, unstaged: 0, untracked: 0, conflicts: 0},
			pullRequest: {kind: 'found', number: 2125, title: 'Selection pane metadata', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: true, baseBranch: 'develop'},
		}] as AppModel['rows'],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
	});
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 100, rows: 30}} />,
	);
	expect(lastFrame()).toContain('Full Path: /repo/.worktree/feat-a');
	expect(lastFrame()).not.toContain('ACTIVE');
	expect(lastFrame()).toContain('PR Title: Selection pane metadata');

});

it('scrolls selection details when the pane is height constrained', async () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: ['active'],
			headSha: '46af3f1c',
			upstream: {branch: 'origin/develop', ahead: 4, behind: 24},
			workingTree: {staged: 1, unstaged: 2, untracked: 3, conflicts: 0},
			pullRequest: {kind: 'found', number: 2125, title: 'Selection pane metadata', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: true, baseBranch: 'develop'},
		}] as AppModel['rows'],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
	});
	const {lastFrame, stdin} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 100, rows: 16}} />,
	);
	expect(lastFrame()).toContain('[Identity]');
	expect(lastFrame()).toContain('█');
	expect(lastFrame()).not.toContain('Full Path: /repo/.worktree/feat-a');
	stdin.write('\u001B[6~');
	await waitForInput();
	await waitForInput();
	expect(lastFrame()).toContain('Full Path: /repo/.worktree/feat-a');
});

it('scrolls selection details with SGR mouse wheel input', async () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: ['active'],
			headSha: '46af3f1c',
			upstream: {branch: 'origin/develop', ahead: 4, behind: 24},
			workingTree: {staged: 1, unstaged: 2, untracked: 3, conflicts: 0},
			pullRequest: {kind: 'found', number: 2125, title: 'Selection pane metadata', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: true, baseBranch: 'develop'},
		}] as AppModel['rows'],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
	});
	const {lastFrame, stdin} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 100, rows: 16}} />,
	);
	expect(lastFrame()).not.toContain('Full Path: /repo/.worktree/feat-a');
	stdin.write('\u001B[<65;80;10M');
	await waitForInput();
	await waitForInput();
	expect(lastFrame()).toContain('Full Path: /repo/.worktree/feat-a');
});

it('renders a minimal fallback shell on very short terminals', () => {
	const model = createModel({rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}], activePath: '/repo', activeBranch: 'develop'});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 30, rows: 8}} />);
	expect(lastFrame()).toContain('A:develop');
	expect(lastFrame()).toContain('S:develop');
	expect(lastFrame()).toContain('T:idle');
	expect(lastFrame()).toContain('↑↓jk↵q');
});

it('shows completion alert after starting a worktree', async () => {
	const model = createModel({
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
	});
	const completed = {
		...model,
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
		status: {kind: 'running', message: 'started feat/a'},
	} as const;
	const {lastFrame, stdin} = render(
		<App
			initialModel={model}
			actions={{
				...makeFakeActions(model),
				start: vi.fn(async () => completed),
			}}
			windowSizeOverride={{columns: 80, rows: 22}}
		/>,
	);
	stdin.write('\r');
	await waitForInput();
	await waitForInput();
	await waitForInput();
	expect(lastFrame()).toContain('Switched to feat/a');
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
	expect(lastFrame()).toContain('Path: .worktree/feature/long');
	expect(lastFrame()).toContain('Full Path: /repo/.worktree/feature/this/is/a/very/long/path/that/keeps/…');
});
it('shows git and PR metadata in the selection pane', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: ['active'],
			headSha: '46af3f1c',
			upstream: {branch: 'origin/develop', ahead: 4, behind: 24},
			workingTree: {staged: 1, unstaged: 2, untracked: 3, conflicts: 0},
			pullRequest: {kind: 'found', number: 2125, title: 'Selection pane metadata', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: true, baseBranch: 'develop'},
		}] as AppModel['rows'],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('[Identity]');
	expect(lastFrame()).toContain('Path: .worktree/feat-a');
	expect(lastFrame()).toContain('HEAD: 46af3f1c');
	expect(lastFrame()).toContain('[Git / PR]');
	expect(lastFrame()).toContain('Upstream: origin/develop (↑4 ↓24)');
	expect(lastFrame()).toContain('Status: dirty (index 1 · worktree 2 · untracked 3)');
	expect(lastFrame()).toContain('PR: #2125 draft/open → develop');
	expect(lastFrame()).toContain('PR Title: Selection pane metadata');
	expect(lastFrame()).toContain('[Action]');
	expect(lastFrame()).toContain('Already active. Press s to stop the current session.');
});
it('shows unavailable metadata when git or gh inspection fails', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: [],
			upstreamUnavailable: true,
			pullRequest: {kind: 'unavailable'},
		}] as AppModel['rows'],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Upstream: unavailable');
	expect(lastFrame()).toContain('Status: unavailable');
	expect(lastFrame()).toContain('PR: unavailable');
});
it('keeps no-upstream metadata distinct from unavailable metadata', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: [],
			workingTree: {staged: 0, unstaged: 0, untracked: 0, conflicts: 0},
			pullRequest: {kind: 'none'},
		}] as AppModel['rows'],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Upstream: -');
	expect(lastFrame()).toContain('Status: clean');
	expect(lastFrame()).toContain('PR: none');
});
it('labels historical PR metadata explicitly', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a',
			shortPath: '.worktree/feat-a',
			branch: 'feat/a',
			tags: [],
			pullRequest: {kind: 'found', number: 2001, title: 'Already merged', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2001', state: 'MERGED', isDraft: false, baseBranch: 'develop'},
		}] as AppModel['rows'],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Last PR: #2001 merged → develop');
	expect(lastFrame()).toContain('Last PR Title: Already merged');
});
it('sanitizes PR titles before rendering them into the terminal', () => {
	const model = createModel({
		rows: [{
			path: '/repo/.worktree/feat-a \u2066next',
			shortPath: '.worktree/feat-a \u2066next',
			branch: 'feat/\u202Ebad',
			tags: [],
			upstream: {branch: 'origin/devel\u2028op', ahead: 1, behind: 2},
			pullRequest: {kind: 'found', number: 2125, title: 'bad\nline\u001b[2J\u2028more \u202Ertl', url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125', state: 'OPEN', isDraft: false, baseBranch: 'devel\u2066op'},
		}] as AppModel['rows'],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('Branch: feat/bad');
	expect(lastFrame()).toContain('Path: .worktree/feat-a next');
	expect(lastFrame()).toContain('Full Path: /repo/.worktree/feat-a next');
	expect(lastFrame()).toContain('Upstream: origin/devel op (↑1 ↓2)');
	expect(lastFrame()).toContain('PR: #2125 open → develop');
	expect(lastFrame()).toContain('PR Title: bad line[2J more rtl');
	expect(lastFrame()).not.toContain('\u001b');
	expect(lastFrame()).not.toContain('\u202e');
	expect(lastFrame()).not.toContain('\u2066');
});

it('shows invalid reason in the detail pane before start is attempted', () => {
	const model = createModel({
		rows: [{path: '/bad', shortPath: '/bad', branch: 'fix/bad', tags: ['invalid'], invalidReason: 'Missing required files: default.project.json'}],
		activePath: null,
		activeBranch: null,
	});
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 120, rows: 30}} />);
	expect(lastFrame()).toContain('[Notes]');
	expect(lastFrame()).toContain('Missing required files: default.project.json');
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
	expect(lastFrame()).toContain('Path: .worktree/feat-b');
	expect(lastFrame()).toContain('[Action]');
	expect(lastFrame()).toContain('Already active. Press s to stop the current session.');
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
	expect(lastFrame()).toContain('spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-until-it-wraps-acro');
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
