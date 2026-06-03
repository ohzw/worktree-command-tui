import React from 'react';
import {render} from 'ink-testing-library';
import {expect, it, vi} from 'vitest';
import {App} from './app.js';
import type {AppActions, AppModel} from './core/runtime.js';

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

it('renders dual-pane metadata, list state, and selection detail', () => {
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
	expect(lastFrame()).toContain('reclaim-the-forest');
	expect(lastFrame()).toContain('rojo-serve');
	expect(lastFrame()).toContain('active: feat/a');
	expect(lastFrame()).toContain('Worktrees');
	expect(lastFrame()).toContain('Selection');
	expect(lastFrame()).toContain('Path : /repo');
	expect(lastFrame()).toContain('Tags : main');
	expect(lastFrame()).toContain('Enter start/switch');
	expect(lastFrame()).toContain('s stop');
});

it('keeps the active branch visible when the header is truncated', () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest-with-a-long-name',
		namespace: 'rojo-serve-with-a-long-namespace',
		rows: [{path: '/repo', shortPath: '.', branch: 'develop', tags: ['main']}],
		activePath: '/repo',
		activeBranch: 'feature/this-is-a-very-long-branch-name-that-should-still-be-visible',
		status: {kind: 'idle', message: 'ready'},
	};
	const {lastFrame} = render(<App initialModel={model} actions={makeFakeActions(model)} />);
	expect(lastFrame()).toContain('active: feature/this-is-a-very-long-branch-name-that-should-still-be-visible');
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
	expect(lastFrame()).toContain('feature/this-is-a-very-lon…');
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
	expect(lastFrame()).toContain('feature/this-is-a-very-long-branch-name-that-wraps-and-keeps-going-pas…');
	expect(lastFrame()).toContain('Path : /repo/.worktree/feature/this/is/a/very/long/path/that/keeps/goi…');
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
	expect(lastFrame()).toContain('Missing required files: default.project.json');
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

it('keeps the same worktree selected when start reorders the list', async () => {
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
	await waitForInput();
	expect(lastFrame()).toContain('active: feat/b');
	expect(lastFrame()).toContain('Path : /repo/.worktree/feat-b');
	expect(lastFrame()).toContain('Already active. Press s to stop the current session.');
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
	expect(lastFrame()).toContain('spawn failed: /tmp/logs/rojo-with-a-very-long-file-name-that-keeps-going-until-it-w…');
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
