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

it('renders header metadata plus main/active/external rows', () => {
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
	expect(lastFrame()).toContain('main');
	expect(lastFrame()).toContain('active');
	expect(lastFrame()).toContain('external');
	expect(lastFrame()).toContain('.worktree/feat-a');
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

it('converts start failures into error status instead of crashing the app', async () => {
	const model: AppModel = {
		repoName: 'reclaim-the-forest',
		namespace: 'rojo-serve',
		rows: [{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: []}],
		activePath: null,
		activeBranch: null,
		status: {kind: 'idle', message: 'ready'},
	};
	const start = vi.fn().mockRejectedValue(new Error('spawn failed: /tmp/logs/rojo.log'));
	const {lastFrame, stdin} = render(<App initialModel={model} actions={{...makeFakeActions(model), start}} />);
	stdin.write('\r');
	await waitForInput();
	expect(lastFrame()).toContain('spawn failed');
	expect(lastFrame()).toContain('/tmp/logs/rojo.log');
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
