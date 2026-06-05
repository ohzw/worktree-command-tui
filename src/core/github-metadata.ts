import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const GH_TIMEOUT_MS = 2500;
const SCP_REMOTE_URL_RE = /^(?:[^@]+@)?([^:]+):(.+)$/;

interface GitHubRepository {
	host: string;
	owner: string;
	name: string;
}

interface GitHubPullRequestResponseItem {
	number?: unknown;
	title?: unknown;
	html_url?: unknown;
	state?: unknown;
	draft?: unknown;
	merged_at?: unknown;
	base?: {ref?: unknown};
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

interface ParsedPullRequest {
	number: number;
	title: string;
	url: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	baseRefName: string;
}

function splitRepositoryPath(pathInput: string): string[] {
	return pathInput
		.replace(/\.git$/, '')
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.split('/')
		.filter(Boolean);
}

function parseGitHubRepositoryFromRemoteUrl(remoteUrl: string): GitHubRepository | null {
	const trimmedUrl = remoteUrl.trim();
	if (!trimmedUrl) {
		return null;
	}

	if (trimmedUrl.includes('://')) {
		if (!URL.canParse(trimmedUrl)) {
			return null;
		}

		const parsedUrl = new URL(trimmedUrl);
		const segments = splitRepositoryPath(parsedUrl.pathname);
		if (segments.length < 2) {
			return null;
		}

		return {host: parsedUrl.hostname.toLowerCase(), owner: segments[0]!, name: segments[1]!};
	}

	const scpMatch = SCP_REMOTE_URL_RE.exec(trimmedUrl);
	if (!scpMatch) {
		return null;
	}

	const segments = splitRepositoryPath(scpMatch[2]!);
	if (segments.length < 2) {
		return null;
	}

	return {host: scpMatch[1]!.toLowerCase(), owner: segments[0]!, name: segments[1]!};
}

async function readGitHubRepository(cwd: string): Promise<GitHubRepository> {
	const {stdout} = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {cwd});
	const repository = parseGitHubRepositoryFromRemoteUrl(stdout);
	if (!repository) {
		throw new Error('GitHub repository remote unavailable');
	}
	return repository;
}

function buildPullRequestListArgs(
	repository: GitHubRepository,
	branch: string,
	state: 'all' | 'open',
): string[] {
	const args = [
		'api',
		'-X',
		'GET',
		`repos/${repository.owner}/${repository.name}/pulls`,
		'-f',
		`state=${state}`,
		'-f',
		`head=${repository.owner}:${branch}`,
		'-F',
		'per_page=1',
	];

	if (repository.host !== 'github.com' && repository.host !== 'www.github.com') {
		args.push('--hostname', repository.host);
	}

	return args;
}

function normalizePullRequestState(
	state: unknown,
	mergedAt: unknown,
): 'OPEN' | 'CLOSED' | 'MERGED' {
	if (typeof state === 'string' && state.toUpperCase() === 'OPEN') {
		return 'OPEN';
	}

	return typeof mergedAt === 'string' && mergedAt.length > 0 ? 'MERGED' : 'CLOSED';
}

function parsePullRequest(item: unknown): ParsedPullRequest | null {
	if (typeof item !== 'object' || item === null) {
		return null;
	}

	const pullRequest = item as GitHubPullRequestResponseItem;
	const number = typeof pullRequest.number === 'number' ? pullRequest.number : NaN;
	const title = typeof pullRequest.title === 'string' ? pullRequest.title : '';
	const url = typeof pullRequest.html_url === 'string' ? pullRequest.html_url : '';
	const isDraft = typeof pullRequest.draft === 'boolean' ? pullRequest.draft : false;
	const baseRefName = typeof pullRequest.base?.ref === 'string' ? pullRequest.base.ref : '';

	if (!Number.isFinite(number) || !title || !url || !baseRefName) {
		return null;
	}

	return {
		number,
		title,
		url,
		state: normalizePullRequestState(pullRequest.state, pullRequest.merged_at),
		isDraft,
		baseRefName,
	};
}

async function readPullRequestList(cwd: string, branch: string, state: 'all' | 'open'): Promise<ParsedPullRequest[]> {
	const repository = await readGitHubRepository(cwd);
	const args = buildPullRequestListArgs(repository, branch, state);
	const {stdout} = await execFileAsync('gh', args, {cwd, timeout: GH_TIMEOUT_MS});
	const payload = JSON.parse(stdout) as unknown;
	if (!Array.isArray(payload)) {
		throw new Error('GitHub REST API returned unexpected payload');
	}

	const pullRequests: ParsedPullRequest[] = [];
	for (const item of payload) {
		const parsed = parsePullRequest(item);
		if (parsed !== null) {
			pullRequests.push(parsed);
		}
	}

	return pullRequests;
}

export async function readPullRequestInfo(cwd: string, branch: string): Promise<PullRequestInfo> {
	if (branch.startsWith('(')) {
		return {kind: 'none'};
	}

	try {
		const openPullRequests = await readPullRequestList(cwd, branch, 'open');
		const pullRequests = openPullRequests.length > 0
			? openPullRequests
			: await readPullRequestList(cwd, branch, 'all');
		const pullRequest = pullRequests[0];
		if (!pullRequest) {
			return {kind: 'none'};
		}

		return {
			kind: 'found',
			number: pullRequest.number,
			title: pullRequest.title,
			url: pullRequest.url,
			state: pullRequest.state,
			isDraft: pullRequest.isDraft,
			baseBranch: pullRequest.baseRefName,
		};
	} catch {
		return {kind: 'unavailable'};
	}
}
