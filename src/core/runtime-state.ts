import path from 'node:path';
import type {ToolConfig} from './config.js';
import type {AppActions, AppLogEntry, AppLogRefresh, AppModel, AppStatus} from './runtime.js';
import type {SessionPaths, SessionRecord} from './session-store.js';

export interface StartedCommand {
	pid: number;
	pgid: number;
	logPath: string;
}

export interface RuntimeStateAdapter {
	refresh: () => Promise<AppModel>;
	readActive: () => Promise<SessionRecord | null>;
	readLogs: (logPath: string | null) => Promise<AppLogEntry[]>;
	readWorktreeBranch: (worktreePath: string) => Promise<string>;
	getInvalidReason: (worktreePath: string) => Promise<string | null>;
	runSetup: (input: {command: string[]; cwd: string; logsDir: string; logFileBase: string}) => Promise<{logPath: string}>;
	startCommand: (input: {command: string[]; cwd: string; logsDir: string; logFileBase: string}) => Promise<StartedCommand>;
	stopSession: (active: SessionRecord) => Promise<void>;
	clearSession: () => Promise<void>;
	writeSession: (record: SessionRecord) => Promise<void>;
	openEditor: (worktreePath: string) => Promise<AppStatus>;
	openPullRequest: (worktreePath: string) => Promise<AppStatus>;
	deleteWorktree: (worktreePath: string) => Promise<AppStatus>;
	nowIso: () => string;
}

export interface RuntimeStateOptions {
	config: ToolConfig;
	paths: SessionPaths;
	adapter: RuntimeStateAdapter;
}

function toLogFileBase(branch: string): string {
	return branch.replace(/[\\/]/g, '-');
}

export function createRuntimeStateActions({config, paths, adapter}: RuntimeStateOptions): AppActions {
	const refreshLogs = async (): Promise<AppLogRefresh> => {
		const active = await adapter.readActive();
		return {
			logs: await adapter.readLogs(active?.logPath ?? null),
			activePath: active?.worktreePath ?? null,
			activeBranch: active?.branch ?? null,
		};
	};

	const refreshWithStatus = async (run: () => Promise<AppStatus>): Promise<AppModel> => {
		const status = await run();
		const model = await adapter.refresh();
		return {
			...model,
			status,
		};
	};

	const refreshKeepingRunningStatus = async (run: () => Promise<AppStatus>): Promise<AppModel> => {
		const status = await run();
		const model = await adapter.refresh();
		if (model.activePath !== null && status.kind === 'idle') {
			return {
				...model,
				status: {kind: 'running', message: status.message},
			};
		}
		return {
			...model,
			status,
		};
	};

	const stop = async (): Promise<AppModel> => {
		const active = await adapter.readActive();
		if (active) {
			await adapter.stopSession(active);
			await adapter.clearSession();
		}

		const model = await adapter.refresh();
		return {
			...model,
			activePath: null,
			activeBranch: null,
			status: {kind: 'idle', message: active ? 'stopped' : 'already stopped'},
		};
	};

	const setup = async (worktreePath: string): Promise<AppModel> => {
		const setupCommand = config.setupCommand;
		if (setupCommand === undefined) {
			const model = await adapter.refresh();
			return {
				...model,
				status: {kind: 'idle', message: 'setup command is not configured'},
			};
		}

		const branch = await adapter.readWorktreeBranch(worktreePath);
		const logFileBase = `${toLogFileBase(branch)}.setup`;
		const setupLogPath = path.join(paths.logsDir, `${logFileBase}.log`);
		try {
			await adapter.runSetup({
				command: setupCommand,
				cwd: worktreePath,
				logsDir: paths.logsDir,
				logFileBase,
			});
		} catch (error) {
			const model = await adapter.refresh();
			return {
				...model,
				status: {kind: 'error', message: error instanceof Error ? error.message : String(error)},
				logs: await adapter.readLogs(setupLogPath),
			};
		}

		const model = await adapter.refresh();
		return {
			...model,
			status: {kind: model.activePath === null ? 'idle' : 'running', message: `setup complete for ${branch}`},
			logs: await adapter.readLogs(setupLogPath),
		};
	};

	const start = async (worktreePath: string): Promise<AppModel> => {
		const current = await adapter.readActive();
		if (current?.worktreePath === worktreePath) {
			const model = await adapter.refresh();
			return {
				...model,
				activePath: current.worktreePath,
				activeBranch: current.branch,
				status: {kind: 'idle', message: 'already active'},
			};
		}

		const invalidReason = await adapter.getInvalidReason(worktreePath);
		if (invalidReason) {
			throw new Error(invalidReason);
		}

		if (current) {
			await adapter.stopSession(current);
			await adapter.clearSession();
		}

		const branch = await adapter.readWorktreeBranch(worktreePath);
		const started = await adapter.startCommand({
			command: config.command,
			cwd: worktreePath,
			logsDir: paths.logsDir,
			logFileBase: toLogFileBase(branch),
		});
		await adapter.writeSession({
			namespace: config.namespace,
			worktreePath,
			branch,
			pid: started.pid,
			pgid: started.pgid,
			port: config.port,
			logPath: started.logPath,
			startedAt: adapter.nowIso(),
		});

		const model = await adapter.refresh();
		return {
			...model,
			activePath: worktreePath,
			activeBranch: branch,
			status: {kind: 'running', message: `started ${branch}`},
		};
	};

	const openEditor = async (worktreePath: string): Promise<AppModel> => refreshKeepingRunningStatus(() => adapter.openEditor(worktreePath));
	const openPullRequest = async (worktreePath: string): Promise<AppModel> => refreshKeepingRunningStatus(() => adapter.openPullRequest(worktreePath));
	const deleteWorktree = async (worktreePath: string): Promise<AppModel> => refreshWithStatus(() => adapter.deleteWorktree(worktreePath));

	return {setup, start, stop, refresh: adapter.refresh, refreshLogs, openEditor, openPullRequest, deleteWorktree};
}
