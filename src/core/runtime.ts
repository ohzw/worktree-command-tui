import path from 'node:path';
import {loadToolConfig} from './config-lifecycle.js';
import {readWorktrees, sortWorktrees, toShortPath, type WorktreeRow} from './git-worktrees.js';
import {readGitStatusSummary, readBranchCreatedAtMs, resolveRepoContext, type UpstreamInfo, type WorkingTreeInfo} from './git-metadata.js';
import {readPullRequestInfo, type PullRequestInfo} from './github-metadata.js';
import {readLogs, type LogEntry} from './log-reader.js';
import {getInvalidReason} from './validation.js';
import {getSessionPaths, readSessionRecord, writeSessionRecord, clearSessionRecord} from './session-store.js';
import {runCommandToLog, startDetachedCommand} from './command-runner.js';
import {stopSessionWithFallback} from './process-control.js';
import {isProcessGroupAlive, killProcessGroup, killPortOwner, killOrphans} from './posix-process.js';
import {createRuntimeStateActions} from './runtime-state.js';

const SHORT_SHA_LENGTH = 8;

export type RowTag = 'main' | 'active' | 'invalid' | 'external' | 'legacy';

export interface AppRow {
	path: string;
	shortPath: string;
	branch: string;
	headSha?: string;
	tags: RowTag[];
	upstream?: UpstreamInfo;
	upstreamUnavailable?: boolean;
	workingTree?: WorkingTreeInfo;
	pullRequest?: PullRequestInfo;
	branchCreatedAtMs?: number;
	invalidReason?: string;
}

export interface AppStatus {
	kind: 'idle' | 'setting-up' | 'starting' | 'running' | 'stopping' | 'error';
	message: string;
}

export type AppLogEntry = LogEntry;

export interface AppModel {
	repoName: string;
	namespace: string;
	rows: AppRow[];
	activePath: string | null;
	activeBranch: string | null;
	status: AppStatus;
	setupAvailable: boolean;
	logs: AppLogEntry[];
}

export interface AppActions {
	setup: (worktreePath: string) => Promise<AppModel>;
	start: (worktreePath: string) => Promise<AppModel>;
	stop: () => Promise<AppModel>;
	refresh: () => Promise<AppModel>;
	refreshLogs: () => Promise<AppLogEntry[]>;
}


function shortenSha(headSha: string): string {
	return headSha.slice(0, SHORT_SHA_LENGTH);
}

async function readRowMetadata(
	worktreePath: string,
	branch: string,
): Promise<Pick<AppRow, 'upstream' | 'upstreamUnavailable' | 'workingTree' | 'pullRequest' | 'branchCreatedAtMs'>> {
	const [statusSummary, pullRequest, branchCreatedAtMs] = await Promise.all([
		readGitStatusSummary(worktreePath),
		readPullRequestInfo(worktreePath, branch),
		readBranchCreatedAtMs(worktreePath, branch),
	]);
	return {
		upstream: statusSummary.upstream,
		upstreamUnavailable: statusSummary.upstreamUnavailable,
		workingTree: statusSummary.workingTree,
		pullRequest,
		branchCreatedAtMs: branchCreatedAtMs ?? undefined,
	};
}

export function toAppRow(
	mainWorktreePath: string,
	worktree: WorktreeRow,
	activePath: string | null,
	invalidReason: string | null,
	metadata: Pick<AppRow, 'upstream' | 'upstreamUnavailable' | 'workingTree' | 'pullRequest' | 'branchCreatedAtMs'>,
): AppRow {
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
		headSha: shortenSha(worktree.headSha),
		tags,
		upstream: metadata.upstream,
		upstreamUnavailable: metadata.upstreamUnavailable,
		workingTree: metadata.workingTree,
		pullRequest: metadata.pullRequest,
		branchCreatedAtMs: metadata.branchCreatedAtMs,
		invalidReason: invalidReason ?? undefined,
	};
}

async function buildRows(
	mainWorktreePath: string,
	workspaceRoot: string,
	activePath: string | null,
	requiredFiles: string[],
): Promise<AppRow[]> {
	const worktrees = sortWorktrees(await readWorktrees(workspaceRoot, mainWorktreePath), activePath);
	const rows = await Promise.all(
		worktrees.map(async worktree => {
			const [invalidReason, metadata] = await Promise.all([
				getInvalidReason(worktree.path, requiredFiles),
				readRowMetadata(worktree.path, worktree.branch),
			]);

			return toAppRow(mainWorktreePath, worktree, activePath, invalidReason, metadata);
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
		setupAvailable: config.setupCommand !== undefined,
		logs: await readLogs(paths.logsDir, active?.logPath ?? null),
	};
}

export async function buildActions(cwd: string): Promise<AppActions> {
	const {workspaceRoot, gitCommonDir, mainWorktreePath} = await resolveRepoContext(cwd);
	const config = await loadToolConfig({repoRoot: workspaceRoot});
	const paths = getSessionPaths(gitCommonDir, config.namespace);
	return createRuntimeStateActions({
		config,
		paths,
		adapter: {
			refresh: async () => buildInitialModel(cwd),
			readActive: async () => readSessionRecord(paths, {isSessionAlive: isProcessGroupAlive}),
			readLogs: async logPath => readLogs(paths.logsDir, logPath),
			readWorktreeBranch: async worktreePath => {
				const rows = await readWorktrees(workspaceRoot, mainWorktreePath);
				const selected = rows.find(row => row.path === worktreePath);
				if (!selected) {
					throw new Error(`Worktree disappeared: ${worktreePath}`);
				}
				return selected.branch;
			},
			getInvalidReason: async worktreePath => getInvalidReason(worktreePath, config.requiredFiles),
			runSetup: runCommandToLog,
			startCommand: startDetachedCommand,
			stopSession: async active => stopRecordedSession(active.pgid, active.port, config.orphanMatchers),
			clearSession: async () => clearSessionRecord(paths),
			writeSession: async record => writeSessionRecord(paths, record),
			nowIso: () => new Date().toISOString(),
		},
	});
}
