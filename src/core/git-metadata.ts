import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

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

export interface GitStatusSummary {
	upstream?: UpstreamInfo;
	upstreamUnavailable: boolean;
	workingTree?: WorkingTreeInfo;
}

export interface RepoContext {
	workspaceRoot: string;
	mainWorktreePath: string;
	gitCommonDir: string;
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

export async function readGitStatusSummary(cwd: string): Promise<GitStatusSummary> {
	try {
		const {stdout} = await execFileAsync('git', ['status', '--branch', '--porcelain=v2'], {cwd});
		return parseGitStatusSummary(stdout);
	} catch {
		return {upstreamUnavailable: true};
	}
}

export async function readBranchCreatedAtMs(cwd: string, branch: string): Promise<number | null> {
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

export async function resolveRepoContext(cwd: string): Promise<RepoContext> {
	const [{stdout: workspaceRootRaw}, {stdout: gitCommonDirRaw}] = await Promise.all([
		execFileAsync('git', ['rev-parse', '--show-toplevel'], {cwd}),
		execFileAsync('git', ['rev-parse', '--git-common-dir'], {cwd}),
	]);
	const workspaceRoot = workspaceRootRaw.trim();
	const gitCommonDir = path.resolve(workspaceRoot, gitCommonDirRaw.trim());
	const mainWorktreePath = path.dirname(gitCommonDir);
	return {workspaceRoot, mainWorktreePath, gitCommonDir};
}
