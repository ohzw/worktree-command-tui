import React from 'react';
import {render} from 'ink-testing-library';
import {expect, it, vi} from 'vitest';
import {App, getShellDimensions, shouldUseCompactLayout, shouldUseMinimalLayout} from './app.js';
import type {AppActions, AppModel} from './core/runtime.js';
import {APP_RENDER_OPTIONS} from './render-options.js';

function makeFakeActions(result: AppModel): AppActions {
	return {
		start: vi.fn(async () => result),
		stop: vi.fn(async () => result),
		refresh: vi.fn(async () => result),
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
	expect(getShellDimensions(8, 8)).toEqual({rootWidth: 8, rootHeight: 8, listWidth: 1});
	expect(getShellDimensions(45, 12)).toEqual({rootWidth: 45, rootHeight: 12, listWidth: 13});
	expect(getShellDimensions(100, 30)).toEqual({rootWidth: 100, rootHeight: 30, listWidth: 31});
});

it('switches to compact and minimal layouts for constrained terminals', () => {
	expect(shouldUseMinimalLayout(8, 4)).toBe(true);
	expect(shouldUseMinimalLayout(30, 8)).toBe(false);
	expect(shouldUseCompactLayout(30, 8, 1)).toBe(true);
	expect(shouldUseCompactLayout(50, 16, 10)).toBe(true);
	expect(shouldUseCompactLayout(72, 20, 10)).toBe(true);
	expect(shouldUseCompactLayout(100, 30, 9)).toBe(false);
});

it('renders fullscreen shell with framed panes', () => {
	const model: AppModel = {
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
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('Worktree Command TUI · Repo: reclaim-the-forest');
	expect(lastFrame()).toContain('Active: feat/a');
	expect(lastFrame()).toContain('Namespace: rojo-serve');
	expect(lastFrame()).toContain('Worktrees');
	expect(lastFrame()).toContain('Selection / Action');
	expect(lastFrame()).toContain('Path: /repo');
	expect(lastFrame()).toContain('Tags: main');
	expect(lastFrame()).toContain('Status: idle — ready');
	expect(lastFrame()).toContain('Keys: ↑↓ move  Enter start/switch  s stop  r refresh  q quit');
});

it('renders a compact fallback shell on short terminals', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}],
		activePath: '/repo',
		activeBranch: 'develop',
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 30, rows: 8}} />,
	);
	expect(lastFrame()).toContain('Active: develop');
	expect(lastFrame()).toContain('Selected: develop');
	expect(lastFrame()).toContain('Status: idle — ready');
	expect(lastFrame()).toContain('Keys: ↑↓ Enter s r q · Re…');
});

it('renders a minimal fallback shell on extremely small terminals', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}],
		activePath: '/repo',
		activeBranch: 'develop',
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(
		<App initialModel={model} actions={makeFakeActions(model)} windowSizeOverride={{columns: 8, rows: 4}} />,
	);
	expect(lastFrame()).toContain('A:devel…');
	expect(lastFrame()).toContain('S:devel…');
	expect(lastFrame()).toContain('T:idle');
	expect(lastFrame()).toContain('↑↓↵srq');
});

it('keeps the active branch visible when header metadata is long', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest-with-a-long-name',
		namespace: 'rojo-serve-with-a-long-namespace',
		rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}],
		activePath: '/repo',
		activeBranch: 'feature/this-is-a-very-long-branch-name-that-should-still-be-visible',
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('Active: feature/this-is-a-very-long-branch-name-that-should-still-be-visible');
});

it('truncates long branch labels in the left pane', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo/long', shortPath: '.worktree/long', branch: 'feature/this-is-a-very-long-branch-name-that-wraps', tags: []}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('feature/this-is-a-ve…');
});

it('truncates long branch and path values in the selection pane', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{
			path: '/repo/.worktree/feature/this/is/a/very/long/path/that/keeps/going/until/the/panel/would/wrap',
			shortPath: '.worktree/feature/long',
			branch: 'feature/this-is-a-very-long-branch-name-that-wraps-and-keeps-going-past-the-panel-width',
			tags: [],
		}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('Branch: feature/this-is-a-very-long-branch-name-that-wraps-and-keep…');
	expect(lastFrame()).toContain('Path: /repo/.worktree/feature/this/is/a/very/long/path/that/keeps/g…');
});

it('shows invalid reason in the detail pane before start is attempted', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/bad', shortPath: '/bad', branch: 'fix/bad', tags: ['invalid'], invalidReason: 'Missing required files: default.project.json'}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('Cannot start this worktree.');
	expect(lastFrame()).toContain('Notes: Missing required files: default.project.json');
});

it('shows invalid reason instead of starting when enter is pressed on invalid worktree', async () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/bad', shortPath: '/bad', branch: 'fix/bad', tags: ['invalid'], invalidReason: 'Missing required files: default.project.json'}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const start = vi.fn();
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} />);
	stdin.write('\r');
	await waitForInput();
	expect(start).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('Missing required files: default.project.json');
});

it('keeps the same worktree selected when start reorders the list', () => {
	const initial: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [
			{path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b', tags: []},
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
		],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const reordered: AppModel = {
		...initial,
		rows: [
			{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']},
			{path: '/repo/.worktree/feat-b', shortPath: '.worktree/feat-b', branch: 'feat/b', tags: ['active']},
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []},
		],
		activePath: '/repo/.worktree/feat-b',
		activeBranch: 'feat/b',
		status: {kind: 'running', message: 'started feat/b'},
	};
	const {lastFrame, stdin} = render(<App initialModel={initial} actions={{...makeFakeActions(reordered), start: vi.fn(async () => reordered)}} />);
	stdin.write('\r');
	return waitForInput().then(() => {
		expect(lastFrame()).toContain('Active: feat/b');
		expect(lastFrame()).toContain('Path: /repo/.worktree/feat-b');
		expect(lastFrame()).toContain('Action: Already active. Press s to stop the current session.');
	});
});

it('converts start failures into error status instead of crashing the app', async () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const start = vi.fn().mockRejectedValue(
		new Error('spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-until-it-wraps-across-multiple-columns-and-pushes-the-footer-down.log'),
	);
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} />);
	stdin.write('\r');
	await waitForInput();
	await waitForInput();
	expect(lastFrame()).toContain('Status: error — spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-un…');
});

it('treats selecting the already-active worktree as a no-op refresh', async () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: ['active']}],
		activePath: '/repo/.worktree/feat-a',
		activeBranch: 'feat/a',
		status: {kind: 'idle', message: 'ready'},
	};
	const start = vi.fn();
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} />);
	stdin.write('\r');
	await waitForInput();
	expect(start).not.toHaveBeenCalled();
	expect(lastFrame()).toContain('already active');
});

it('ignores repeated enter presses while start is already in flight', async () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const deferred = Promise.withResolvers<AppModel>();
	const start = vi.fn(async () => deferred.promise);
	const {stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} />);
	stdin.write('\r');
	stdin.write('\r');
	await waitForInput();
	expect(start).toHaveBeenCalledTimes(1);
	deferred.resolve({...model, status: {kind: 'running', message: 'started feat/a'}});
	await waitForInput();
});
