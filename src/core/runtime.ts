import path from 'node:path';
import {execFile} from 'node:child_process';
import {readdir, readFile, stat} from 'node:fs/promises';
import {promisify} from 'node:util';
import {loadToolConfig} from './config.js';
import {readWorktrees, sortWorktrees, toShortPath, type WorktreeRow} from './git-worktrees.js';
import {getInvalidReason} from './validation.js';
import {getSessionPaths, readSessionRecord, writeSessionRecord, clearSessionRecord} from './session-store.js';
import {runCommandToLog, startDetachedCommand} from './command-runner.js';
import {stopSessionWithFallback} from './process-control.js';
import {isProcessGroupAlive, killProcessGroup, killPortOwner, killOrphans} from './posix-process.js';

const execFileAsync = promisify(execFile);
const SHORT_SHA_LENGTH = 8;
const GH_TIMEOUT_MS = 2500;
const MAX_LOG_BYTES = 16 * 1024;
const MAX_LOG_LINES = 120;

export type RowTag = 'main' | 'active' | 'invalid' | 'external' | 'legacy';

export interface UpstreamInfo {
	branch: string;
	ahead: number;
	behind: number;
}

export interface WorkingTreeInfo {
	staged: number;
	unstaged: number;
	untracked: number;
	conflicts: number;
}

export type PullRequestInfo =
	| {
		kind: 'found';
		number: number;
		title: string;
		url: string;
		state: 'OPEN' | 'CLOSED' | 'MERGED';
		isDraft: boolean;
		baseBranch: string;
	}
	| {kind: 'none'}
	| {kind: 'unavailable'};

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

export interface AppLogEntry {
	name: string;
	path: string;
	content: string;
}

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

interface RepoContext {
	workspaceRoot: string;
	mainWorktreePath: string;
	gitCommonDir: string;
}

interface GitStatusSummary {
	upstream?: UpstreamInfo;
	upstreamUnavailable: boolean;
	workingTree?: WorkingTreeInfo;
}

function shortenSha(headSha: string): string {
	return headSha.slice(0, SHORT_SHA_LENGTH);
}

function createEmptyWorkingTree(): WorkingTreeInfo {
	return {staged: 0, unstaged: 0, untracked: 0, conflicts: 0};
}

export function parseGitStatusSummary(output: string): GitStatusSummary {
	const workingTree = createEmptyWorkingTree();
	let upstreamBranch: string | undefined;
	let ahead = 0;
	let behind = 0;

	for (const line of output.split('\n')) {
		if (line.startsWith('# branch.upstream ')) {
			upstreamBranch = line.slice('# branch.upstream '.length).trim();
			continue;
		}
		if (line.startsWith('# branch.ab ')) {
			const match = /# branch\.ab \+(\d+) -(\d+)/.exec(line);
			ahead = Number(match?.[1] ?? 0);
			behind = Number(match?.[2] ?? 0);
			continue;
		}
		if (line.startsWith('1 ') || line.startsWith('2 ')) {
			const [, xy = '..'] = line.split(' ', 3);
			if (xy[0] !== '.') {
				workingTree.staged += 1;
			}
			if (xy[1] !== '.') {
				workingTree.unstaged += 1;
			}
			continue;
		}
		if (line.startsWith('u ')) {
			workingTree.conflicts += 1;
			continue;
		}
		if (line.startsWith('? ')) {
			workingTree.untracked += 1;
		}
	}

	return {
		upstream: upstreamBranch ? {branch: upstreamBranch, ahead, behind} : undefined,
		upstreamUnavailable: false,
		workingTree,
	};
}

async function readGitStatusSummary(cwd: string): Promise<GitStatusSummary> {
	try {
		const {stdout} = await execFileAsync('git', ['status', '--branch', '--porcelain=v2'], {cwd});
		return parseGitStatusSummary(stdout);
	} catch {
		return {upstreamUnavailable: true};
	}
}

async function readPullRequestList(
	cwd: string,
	branch: string,
	state: 'all' | 'open',
): Promise<Array<{
	number: number;
	title: string;
	url: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	baseRefName: string;
}>> {
	const {stdout} = await execFileAsync(
		'gh',
		[
			'pr',
			'list',
			'--head',
			branch,
			'--state',
			state,
			'--limit',
			'1',
			'--json',
			'number,title,url,state,isDraft,baseRefName',
		],
		{cwd, timeout: GH_TIMEOUT_MS},
	);
	return JSON.parse(stdout) as Array<{
		number: number;
		title: string;
		url: string;
		state: 'OPEN' | 'CLOSED' | 'MERGED';
		isDraft: boolean;
		baseRefName: string;
	}>;
}
async function readPullRequestInfo(cwd: string, branch: string): Promise<PullRequestInfo> {
	if (branch.startsWith('(')) {
		return {kind: 'none'};
	}

	try {
		const openPullRequests = await readPullRequestList(cwd, branch, 'open');
		const parsed = openPullRequests.length > 0 ? openPullRequests : await readPullRequestList(cwd, branch, 'all');
		const pr = parsed[0];
		if (!pr) {
			return {kind: 'none'};
		}
		return {
			kind: 'found',
			number: pr.number,
			title: pr.title,
			url: pr.url,
			state: pr.state,
			isDraft: pr.isDraft,
			baseBranch: pr.baseRefName,
		};
	} catch {
		return {kind: 'unavailable'};
	}
}

async function readBranchCreatedAtMs(cwd: string, branch: string): Promise<number | null> {
	if (branch.startsWith('(')) {
		return null;
	}

	try {
		const {stdout} = await execFileAsync('git', ['reflog', 'show', '--format=%ct', `refs/heads/${branch}`], {cwd});
		const trimmed = stdout.trim();
		if (trimmed.length === 0) {
			return null;
		}
		const timestamps = trimmed.split('\n');
		const firstTimestampSeconds = Number(timestamps.at(-1));
		return Number.isFinite(firstTimestampSeconds) ? firstTimestampSeconds * 1000 : null;
	} catch {
		return null;
	}
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

async function buildRows(mainWorktreePath: string, workspaceRoot: string, activePath: string | null, requiredFiles: string[]): Promise<AppRow[]> {
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

function tailLogContent(content: string): string {
	const byteTrimmed = content.length > MAX_LOG_BYTES ? content.slice(-MAX_LOG_BYTES) : content;
	const lines = byteTrimmed.replace(/\r\n/g, '\n').split('\n');
	const tailLines = lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines;
	return tailLines.join('\n').trimEnd();
}

async function readLogs(logsDir: string, activeLogPath: string | null): Promise<AppLogEntry[]> {
	try {
		const entries = (await readdir(logsDir, {withFileTypes: true}))
			.filter(entry => entry.isFile() && entry.name.endsWith('.log'))
			.map(entry => ({name: entry.name, path: path.join(logsDir, entry.name)}));

		if (entries.length === 0) {
			return [];
		}

		let selectedEntries = entries;
		if (activeLogPath !== null) {
			const activeEntry = entries.find(entry => entry.path === activeLogPath);
			if (activeEntry) {
				selectedEntries = [activeEntry];
			}
		} else {
			const withStats = await Promise.all(
				entries.map(async entry => ({
					...entry,
					mtimeMs: (await stat(entry.path)).mtimeMs,
				})),
			);
			withStats.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
			selectedEntries = [withStats[0]!];
		}

		return await Promise.all(
			selectedEntries.map(async entry => ({
				name: entry.name,
				path: entry.path,
				content: tailLogContent(await readFile(entry.path, 'utf8')),
			})),
		);
	} catch {
		return [];
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
	const {workspaceRoot, gitCommonDir} = await resolveRepoContext(cwd);
	const config = await loadToolConfig({repoRoot: workspaceRoot});
	const paths = getSessionPaths(gitCommonDir, config.namespace);
	const mainWorktreePath = path.dirname(gitCommonDir);

	const refresh = async (): Promise<AppModel> => buildInitialModel(cwd);
	const refreshLogs = async (): Promise<AppLogEntry[]> => {
		const active = await readSessionRecord(paths, {isSessionAlive: isProcessGroupAlive});
		return readLogs(paths.logsDir, active?.logPath ?? null);
	};

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

	const setup = async (worktreePath: string): Promise<AppModel> => {
		if (config.setupCommand === undefined) {
			const model = await refresh();
			return {
				...model,
				status: {kind: 'idle', message: 'setup command is not configured'},
			};
		}

		const rows = await readWorktrees(workspaceRoot, mainWorktreePath);
		const selected = rows.find(row => row.path === worktreePath);
		if (!selected) {
			throw new Error(`Worktree disappeared: ${worktreePath}`);
		}

		const logFileBase = `${selected.branch.replace(/[\\/]/g, '-')}.setup`;
		const setupLogPath = path.join(paths.logsDir, `${logFileBase}.log`);
		try {
			await runCommandToLog({
				command: config.setupCommand,
				cwd: worktreePath,
				logsDir: paths.logsDir,
				logFileBase,
				errorLabel: 'setup command',
			});
		} catch (error) {
			const model = await refresh();
			return {
				...model,
				status: {kind: 'error', message: error instanceof Error ? error.message : String(error)},
				logs: await readLogs(paths.logsDir, setupLogPath),
			};
		}

		const model = await refresh();
		return {
			...model,
			status: {kind: model.activePath === null ? 'idle' : 'running', message: `setup complete for ${selected.branch}`},
			logs: await readLogs(paths.logsDir, setupLogPath),
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

	return {setup, start, stop, refresh, refreshLogs};
}
