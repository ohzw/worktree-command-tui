import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadToolConfig} from './config.js';
import {readWorktrees, sortWorktrees, toShortPath} from './git-worktrees.js';
import {getInvalidReason} from './validation.js';
import {getSessionPaths, readSessionRecord, writeSessionRecord, clearSessionRecord} from './session-store.js';
import {startDetachedCommand} from './command-runner.js';
import {stopSessionWithFallback} from './process-control.js';
import {isProcessGroupAlive, killProcessGroup, killPortOwner, killOrphans} from './posix-process.js';

const execFileAsync = promisify(execFile);

export type RowTag = 'main' | 'active' | 'invalid' | 'external' | 'legacy';

export interface AppRow {
	path: string;
	shortPath: string;
	branch: string;
	tags: RowTag[];
	invalidReason?: string;
}

export interface AppStatus {
	kind: 'idle' | 'starting' | 'running' | 'stopping' | 'error';
	message: string;
}

export interface AppModel {
	repoName: string;
	namespace: string;
	rows: AppRow[];
	activePath: string | null;
	activeBranch: string | null;
	status: AppStatus;
}

export interface AppActions {
	start: (worktreePath: string) => Promise<AppModel>;
	stop: () => Promise<AppModel>;
	refresh: () => Promise<AppModel>;
}

interface RepoContext {
	workspaceRoot: string;
	mainWorktreePath: string;
	gitCommonDir: string;
}

async function resolveRepoContext(cwd: string): Promise<RepoContext> {
	const [{stdout: workspaceRootRaw}, {stdout: gitCommonDirRaw}] = await Promise.all([
		execFileAsync('git', ['rev-parse', '--show-toplevel'], {cwd}),
		execFileAsync('git', ['rev-parse', '--git-common-dir'], {cwd}),
	]);
	const workspaceRoot = workspaceRootRaw.trim();
	const gitCommonDir = path.resolve(workspaceRoot, gitCommonDirRaw.trim());
	const mainWorktreePath = path.dirname(gitCommonDir);
	return {workspaceRoot, mainWorktreePath, gitCommonDir};
}

async function buildRows(mainWorktreePath: string, workspaceRoot: string, activePath: string | null, requiredFiles: string[]): Promise<AppRow[]> {
	const worktrees = sortWorktrees(await readWorktrees(workspaceRoot, mainWorktreePath), activePath);
	const rows = await Promise.all(
		worktrees.map(async worktree => {
			const invalidReason = await getInvalidReason(worktree.path, requiredFiles);
			const tags: RowTag[] = [];
			if (worktree.isMain) {
				tags.push('main');
			}
			if (activePath === worktree.path) {
				tags.push('active');
			}
			if (worktree.isExternal) {
				tags.push('external');
			}
			if (invalidReason) {
				tags.push('invalid');
			}

			return {
				path: worktree.path,
				shortPath: toShortPath(mainWorktreePath, worktree.path),
				branch: worktree.branch,
				tags,
				invalidReason: invalidReason ?? undefined,
			};
		}),
	);
	return rows;
}

async function stopRecordedSession(
	pgid: number,
	port: number,
	orphanMatchers: string[],
): Promise<void> {
	const stopped = await stopSessionWithFallback(
		{pgid, port, orphanMatchers},
		{
			killProcessGroup,
			killPortOwner,
			killOrphans,
			isSessionAlive: isProcessGroupAlive,
		},
	);
	if (!stopped) {
		throw new Error(`Failed to stop existing session pgid=${pgid}`);
	}
}

export async function buildInitialModel(cwd: string): Promise<AppModel> {
	const {workspaceRoot, mainWorktreePath, gitCommonDir} = await resolveRepoContext(cwd);
	const config = await loadToolConfig({repoRoot: workspaceRoot});
	const paths = getSessionPaths(gitCommonDir, config.namespace);
	const active = await readSessionRecord(paths, {isSessionAlive: isProcessGroupAlive});
	return {
		repoName: path.basename(mainWorktreePath),
		namespace: config.namespace,
		rows: await buildRows(mainWorktreePath, workspaceRoot, active?.worktreePath ?? null, config.requiredFiles),
		activePath: active?.worktreePath ?? null,
		activeBranch: active?.branch ?? null,
		status: active ? {kind: 'running', message: `Active: ${active.branch}`} : {kind: 'idle', message: 'ready'},
	};
}

export async function buildActions(cwd: string): Promise<AppActions> {
	const {workspaceRoot, gitCommonDir} = await resolveRepoContext(cwd);
	const config = await loadToolConfig({repoRoot: workspaceRoot});
	const paths = getSessionPaths(gitCommonDir, config.namespace);
	const mainWorktreePath = path.dirname(gitCommonDir);

	const refresh = async (): Promise<AppModel> => buildInitialModel(cwd);

	const stop = async (): Promise<AppModel> => {
		const active = await readSessionRecord(paths, {isSessionAlive: isProcessGroupAlive});
		if (active) {
			await stopRecordedSession(active.pgid, active.port, config.orphanMatchers);
			await clearSessionRecord(paths);
		}

		const model = await refresh();
		return {
			...model,
			activePath: null,
			activeBranch: null,
			status: {kind: 'idle', message: active ? 'stopped' : 'already stopped'},
		};
	};

	const start = async (worktreePath: string): Promise<AppModel> => {
		const current = await readSessionRecord(paths, {isSessionAlive: isProcessGroupAlive});
		if (current?.worktreePath === worktreePath) {
			const model = await refresh();
			return {
				...model,
				activePath: current.worktreePath,
				activeBranch: current.branch,
				status: {kind: 'idle', message: 'already active'},
			};
		}

		const invalidReason = await getInvalidReason(worktreePath, config.requiredFiles);
		if (invalidReason) {
			throw new Error(invalidReason);
		}

		if (current) {
			await stopRecordedSession(current.pgid, current.port, config.orphanMatchers);
			await clearSessionRecord(paths);
		}

		const rows = await readWorktrees(workspaceRoot, mainWorktreePath);
		const selected = rows.find(row => row.path === worktreePath);
		if (!selected) {
			throw new Error(`Worktree disappeared: ${worktreePath}`);
		}

		const started = await startDetachedCommand({
			command: config.command,
			cwd: worktreePath,
			logsDir: paths.logsDir,
			logFileBase: selected.branch.replace(/[\\/]/g, '-'),
		});
		await writeSessionRecord(paths, {
			namespace: config.namespace,
			worktreePath,
			branch: selected.branch,
			pid: started.pid,
			pgid: started.pgid,
			port: config.port,
			logPath: started.logPath,
			startedAt: new Date().toISOString(),
		});

		const model = await refresh();
		return {
			...model,
			activePath: worktreePath,
			activeBranch: selected.branch,
			status: {kind: 'running', message: `started ${selected.branch}`},
		};
	};

	return {start, stop, refresh};
}
