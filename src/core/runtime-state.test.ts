import {describe, expect, it, vi} from 'vitest';
import type {ToolConfig} from './config.js';
import type {AppLogEntry, AppModel} from './runtime.js';
import {createRuntimeStateActions, type RuntimeStateAdapter} from './runtime-state.js';
import type {SessionRecord} from './session-store.js';

const paths = {
	baseDir: '/repo/.git/worktree-command-tui',
	logsDir: '/repo/.git/worktree-command-tui/logs',
	sessionFile: '/repo/.git/worktree-command-tui/test.json',
};

const config: ToolConfig = {
	namespace: 'test',
	command: ['npm', 'start'],
	setupCommand: [['npm', 'install']],
	editorCommand: ['code', '--reuse-window'],
	port: 3000,
	ports: [3000, 4000],
	requiredFiles: ['package.json'],
	orphanMatchers: ['vite --host'],
};

const baseModel: AppModel = {
	repoName: 'repo',
	namespace: 'test',
	rows: [{path: '/repo', shortPath: '.', branch: 'main', tags: ['main']}],
	activePath: null,
	activeBranch: null,
	status: {kind: 'idle', message: 'ready'},
	setupAvailable: true,
	editorAvailable: true,
	logs: [],
};

const activeRecord: SessionRecord = {
	namespace: 'test',
	worktreePath: '/repo',
	branch: 'main',
	pid: 111,
	pgid: 111,
	port: 3000,
	logPath: '/repo/.git/worktree-command-tui/logs/main.log',
	startedAt: '2026-06-05T00:00:00.000Z',
};

function makeAdapter(overrides: Partial<RuntimeStateAdapter> = {}) {
	const calls: string[] = [];
	const adapter: RuntimeStateAdapter = {
		refresh: vi.fn(async () => ({...baseModel})),
		readActive: vi.fn(async () => null),
		readLogs: vi.fn(async (_logPath: string | null) => []),
		readWorktreeBranch: vi.fn(async (worktreePath: string) => {
			if (worktreePath !== '/repo') {
				throw new Error(`Worktree disappeared: ${worktreePath}`);
			}
			return 'main';
		}),
		getInvalidReason: vi.fn(async () => null),
		runSetup: vi.fn(async () => ({logPath: '/repo/.git/worktree-command-tui/logs/main.setup.log'})),
		startCommand: vi.fn(async () => ({pid: 222, pgid: 222, logPath: '/repo/.git/worktree-command-tui/logs/main.log'})),
		stopSession: vi.fn(async () => {
			calls.push('stop');
		}),
		clearSession: vi.fn(async () => {
			calls.push('clear');
		}),
		writeSession: vi.fn(async () => {
			calls.push('write');
		}),
		openEditor: vi.fn(async () => ({kind: 'idle' as const, message: 'opened editor for main'})),
		openPullRequest: vi.fn(async () => ({kind: 'idle' as const, message: 'no pull request found for main'})),
		deleteWorktree: vi.fn(async () => ({kind: 'idle' as const, message: 'deleted main'})),
		nowIso: vi.fn(() => '2026-06-05T12:00:00.000Z'),
		...overrides,
	};
	return {adapter, calls};
}

describe('createRuntimeStateActions', () => {
	it('reports setup unavailable without running setup', async () => {
		const {adapter} = makeAdapter();
		const actions = createRuntimeStateActions({config: {...config, setupCommand: undefined}, paths, adapter});

		const model = await actions.setup('/repo');

		expect(adapter.runSetup).not.toHaveBeenCalled();
		expect(model.status).toEqual({kind: 'idle', message: 'setup command is not configured'});
	});

	it('returns already-active status without validating or starting the same worktree', async () => {
		const {adapter} = makeAdapter({
			readActive: vi.fn(async () => activeRecord),
			refresh: vi.fn(async () => ({...baseModel, activePath: '/repo', activeBranch: 'main'})),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.start('/repo');

		expect(adapter.getInvalidReason).not.toHaveBeenCalled();
		expect(adapter.startCommand).not.toHaveBeenCalled();
		expect(model.activePath).toBe('/repo');
		expect(model.activeBranch).toBe('main');
		expect(model.status).toEqual({kind: 'idle', message: 'already active'});
	});

	it('rejects invalid worktrees before stopping the current session', async () => {
		const {adapter} = makeAdapter({
			readActive: vi.fn(async () => ({...activeRecord, worktreePath: '/other', branch: 'other'})),
			getInvalidReason: vi.fn(async () => 'Missing required file: package.json'),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		await expect(actions.start('/repo')).rejects.toThrow('Missing required file: package.json');

		expect(adapter.stopSession).not.toHaveBeenCalled();
		expect(adapter.clearSession).not.toHaveBeenCalled();
		expect(adapter.startCommand).not.toHaveBeenCalled();
	});

	it('stops the current session before clearing its record', async () => {
		const {adapter, calls} = makeAdapter({readActive: vi.fn(async () => activeRecord)});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.stop();

		expect(adapter.stopSession).toHaveBeenCalledWith(activeRecord);
		expect(calls).toEqual(['stop', 'clear']);
		expect(model.status).toEqual({kind: 'idle', message: 'stopped'});
		expect(model.activePath).toBeNull();
		expect(model.activeBranch).toBeNull();
	});

	it('reports already stopped without cleanup when no session is active', async () => {
		const {adapter} = makeAdapter();
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.stop();

		expect(adapter.stopSession).not.toHaveBeenCalled();
		expect(adapter.clearSession).not.toHaveBeenCalled();
		expect(model.status).toEqual({kind: 'idle', message: 'already stopped'});
		expect(model.activePath).toBeNull();
		expect(model.activeBranch).toBeNull();
	});

	it('returns editor status after refresh', async () => {
		const {adapter} = makeAdapter();
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.openEditor('/repo');

		expect(adapter.openEditor).toHaveBeenCalledWith('/repo');
		expect(model.status).toEqual({kind: 'idle', message: 'opened editor for main'});
	});

	it('keeps running status after non-destructive actions when a session stays active', async () => {
		const {adapter} = makeAdapter({
			refresh: vi.fn(async () => ({...baseModel, activePath: '/repo', activeBranch: 'main', status: {kind: 'running' as const, message: 'Active: main'}})),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.openEditor('/repo');

		expect(model.activePath).toBe('/repo');
		expect(model.activeBranch).toBe('main');
		expect(model.status).toEqual({kind: 'running', message: 'opened editor for main'});
	});

	it('returns pull request status after refresh without throwing for no-op results', async () => {
		const {adapter} = makeAdapter();
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.openPullRequest('/repo');

		expect(adapter.openPullRequest).toHaveBeenCalledWith('/repo');
		expect(model.status).toEqual({kind: 'idle', message: 'no pull request found for main'});
	});

	it('returns delete status after refresh', async () => {
		const {adapter} = makeAdapter({
			refresh: vi.fn(async () => ({...baseModel, rows: []})),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.deleteWorktree('/repo');

		expect(adapter.deleteWorktree).toHaveBeenCalledWith('/repo');
		expect(model.rows).toEqual([]);
		expect(model.status).toEqual({kind: 'idle', message: 'deleted main'});
	});

	it('keeps delete status idle when another session remains active after refresh', async () => {
		const {adapter} = makeAdapter({
			refresh: vi.fn(async () => ({...baseModel, activePath: '/repo', activeBranch: 'main', status: {kind: 'running' as const, message: 'Active: main'}})),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.deleteWorktree('/repo');

		expect(model.activePath).toBe('/repo');
		expect(model.activeBranch).toBe('main');
		expect(model.status).toEqual({kind: 'idle', message: 'deleted main'});
	});

	it('refreshes logs from the active session log path', async () => {
		const logs: AppLogEntry[] = [{name: 'main.log', path: '/repo/.git/worktree-command-tui/logs/main.log', content: 'ready\n'}];
		const {adapter} = makeAdapter({
			readActive: vi.fn(async () => activeRecord),
			readLogs: vi.fn(async logPath => logPath === activeRecord.logPath ? logs : []),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const result = await actions.refreshLogs();

		expect(adapter.readLogs).toHaveBeenCalledWith(activeRecord.logPath);
		expect(result).toEqual({logs, activePath: activeRecord.worktreePath, activeBranch: activeRecord.branch});
	});

	it('refreshes logs with no active log path when idle', async () => {
		const logs: AppLogEntry[] = [{name: 'old.log', path: '/repo/.git/worktree-command-tui/logs/old.log', content: 'old\n'}];
		const {adapter} = makeAdapter({
			readLogs: vi.fn(async logPath => logPath === null ? logs : []),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const result = await actions.refreshLogs();

		expect(adapter.readLogs).toHaveBeenCalledWith(null);
		expect(result).toEqual({logs, activePath: null, activeBranch: null});
	});

	it('returns setup success status and setup logs', async () => {
		const logs: AppLogEntry[] = [{name: 'main.setup.log', path: '/logs/main.setup.log', content: 'installed\n'}];
		const {adapter} = makeAdapter({
			readLogs: vi.fn(async logPath => logPath === '/repo/.git/worktree-command-tui/logs/main.setup.log' ? logs : []),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.setup('/repo');

		expect(adapter.runSetup).toHaveBeenCalledWith({command: config.setupCommand?.[0], cwd: '/repo', logsDir: paths.logsDir, logFileBase: 'main.setup', workspaceRoot: undefined});
		expect(model.status).toEqual({kind: 'idle', message: 'setup complete for main'});
		expect(model.logs).toBe(logs);
	});

	it('keeps running status after setup succeeds when a session is active', async () => {
		const {adapter} = makeAdapter({
			refresh: vi.fn(async () => ({...baseModel, activePath: '/repo', activeBranch: 'main', status: {kind: 'running' as const, message: 'Active: main'}})),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.setup('/repo');

		expect(model.status).toEqual({kind: 'running', message: 'setup complete for main'});
	});

	it('returns setup failure status and setup logs', async () => {
		const logs: AppLogEntry[] = [{name: 'main.setup.log', path: '/logs/main.setup.log', content: 'failed\n'}];
		const {adapter} = makeAdapter({
			runSetup: vi.fn(async () => {
				throw new Error('setup command exited with code 1; see /logs/main.setup.log');
			}),
			readLogs: vi.fn(async logPath => logPath === '/repo/.git/worktree-command-tui/logs/main.setup.log' ? logs : []),
		});
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.setup('/repo');

		expect(model.status).toEqual({kind: 'error', message: 'setup command exited with code 1; see /logs/main.setup.log'});
		expect(model.logs).toBe(logs);
	});

	it('writes the started session record before returning the refreshed running model', async () => {
		const {adapter, calls} = makeAdapter();
		const actions = createRuntimeStateActions({config, paths, adapter});

		const model = await actions.start('/repo');

		expect(adapter.writeSession).toHaveBeenCalledWith({
			namespace: 'test',
			worktreePath: '/repo',
			branch: 'main',
			pid: 222,
			pgid: 222,
			port: 3000,
			ports: [3000, 4000],
			logPath: '/repo/.git/worktree-command-tui/logs/main.log',
			startedAt: '2026-06-05T12:00:00.000Z',
		});
		expect(calls).toEqual(['write']);
		expect(model.activePath).toBe('/repo');
		expect(model.activeBranch).toBe('main');
		expect(model.status).toEqual({kind: 'running', message: 'started main'});
	});
});
