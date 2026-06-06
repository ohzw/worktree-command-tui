import type {AppRow, RowTag} from './runtime.js';

export type ProjectionSeverity = 'success' | 'error' | 'info';
export type ProjectionTag = RowTag | string;

export type WorktreeListRowState = 'active' | 'invalid' | 'external' | 'normal';

export interface WorktreeListRowProjection {
	state: WorktreeListRowState;
	isSelected: boolean;
	isMain: boolean;
}

export interface TagProjection {
	tag: ProjectionTag;
}

export type ActionProjection =
	| {kind: 'blocked'; severity: 'error'}
	| {kind: 'active'; severity: 'success'}
	| {kind: 'startable'; severity: 'error' | 'info'};

export type NoteProjection =
	| {kind: 'invalid'; severity: 'error'; invalidReason: string}
	| {kind: 'external'; severity: 'info'}
	| {kind: 'ready'; severity: 'error' | 'info'};

export type UpstreamProjection =
	| {kind: 'unavailable'}
	| {kind: 'none'}
	| {kind: 'found'; branch: string; ahead: number; behind: number};

export type WorkingTreePartKind = 'staged' | 'unstaged' | 'untracked' | 'conflicts';
export type WorkingTreeProjection =
	| {kind: 'unavailable'}
	| {kind: 'clean'}
	| {kind: 'dirty'; parts: Array<{kind: WorkingTreePartKind; count: number}>};

export type PullRequestProjection =
	| {kind: 'none'}
	| {kind: 'unavailable'}
	| {
		kind: 'found';
		number: number;
		title: string;
		state: 'OPEN' | 'CLOSED' | 'MERGED';
		isDraft: boolean;
		baseBranch: string;
		isHistorical: boolean;
	};

const tagPriority: Record<string, number> = {
	active: 0,
	main: 1,
	external: 2,
	invalid: 3,
};

const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const ANSI_OSC_PATTERN = /\u001B\][^\u0007\u001B\u009C]*(?:\u0007|\u001B\\|\u009C)?/gu;
const ANSI_STRING_PATTERN = /\u001B[P^_X][\s\S]*?(?:\u001B\\|\u009C|$)/gu;
const C1_STRING_PATTERN = /[\u0090\u0098\u009D\u009E\u009F][^\u0007\u009C]*(?:\u0007|\u009C)?/gu;

export function sanitizeInlineText(value: string): string {
	return value
		.replace(ANSI_OSC_PATTERN, '')
		.replace(ANSI_STRING_PATTERN, '')
		.replace(C1_STRING_PATTERN, '')
		.replace(ANSI_CSI_PATTERN, '')
		.replace(/[\r\n\t\u2028\u2029]+/g, ' ')
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
		.replace(/\p{Cf}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}


function hasTag(row: AppRow, tag: RowTag): boolean {
	return row.tags.includes(tag);
}

function hasConflicts(row: AppRow): boolean {
	return (row.workingTree?.conflicts ?? 0) > 0;
}


export function projectWorktreeListRow(row: AppRow, isSelected: boolean): WorktreeListRowProjection {
	let state: WorktreeListRowState = 'normal';
	if (hasTag(row, 'active')) {
		state = 'active';
	} else if (hasTag(row, 'invalid')) {
		state = 'invalid';
	} else if (hasTag(row, 'external')) {
		state = 'external';
	}

	return {
		state,
		isSelected,
		isMain: hasTag(row, 'main'),
	};
}

export function getOrderedNonActiveTags(tags: readonly string[]): TagProjection[] {
	return tags
		.filter(tag => tag !== 'active')
		.slice()
		.sort((a, b) => {
			const aPriority = tagPriority[a] ?? 10;
			const bPriority = tagPriority[b] ?? 10;
			if (aPriority === bPriority) {
				return a.localeCompare(b);
			}
			return aPriority - bPriority;
		})
		.map(tag => ({tag}));
}

export function projectAction(row: AppRow, activePath: string | null): ActionProjection {
	if (row.invalidReason) {
		return {kind: 'blocked', severity: 'error'};
	}
	if (row.path === activePath) {
		return {kind: 'active', severity: 'success'};
	}
	return {kind: 'startable', severity: hasConflicts(row) ? 'error' : 'info'};
}

export function projectNote(row: AppRow): NoteProjection {
	if (row.invalidReason) {
		return {kind: 'invalid', severity: 'error', invalidReason: sanitizeInlineText(row.invalidReason)};
	}
	if (hasTag(row, 'external')) {
		return {kind: 'external', severity: 'info'};
	}
	return {kind: 'ready', severity: hasConflicts(row) ? 'error' : 'info'};
}

export function projectUpstream(row: AppRow): UpstreamProjection {
	if (row.upstreamUnavailable) {
		return {kind: 'unavailable'};
	}
	if (!row.upstream) {
		return {kind: 'none'};
	}
	return {
		kind: 'found',
		branch: sanitizeInlineText(row.upstream.branch),
		ahead: row.upstream.ahead,
		behind: row.upstream.behind,
	};
}

export function projectWorkingTree(row: AppRow): WorkingTreeProjection {
	if (!row.workingTree) {
		return {kind: 'unavailable'};
	}
	const {staged, unstaged, untracked, conflicts} = row.workingTree;
	if (staged === 0 && unstaged === 0 && untracked === 0 && conflicts === 0) {
		return {kind: 'clean'};
	}

	const parts: Array<{kind: WorkingTreePartKind; count: number}> = [];
	if (staged > 0) {
		parts.push({kind: 'staged', count: staged});
	}
	if (unstaged > 0) {
		parts.push({kind: 'unstaged', count: unstaged});
	}
	if (untracked > 0) {
		parts.push({kind: 'untracked', count: untracked});
	}
	if (conflicts > 0) {
		parts.push({kind: 'conflicts', count: conflicts});
	}
	return {kind: 'dirty', parts};
}

export function projectPullRequest(row: AppRow): PullRequestProjection {
	if (!row.pullRequest || row.pullRequest.kind === 'none') {
		return {kind: 'none'};
	}
	if (row.pullRequest.kind === 'unavailable') {
		return {kind: 'unavailable'};
	}

	const isHistorical = row.pullRequest.state !== 'OPEN';
	return {
		kind: 'found',
		number: row.pullRequest.number,
		title: sanitizeInlineText(row.pullRequest.title),
		state: row.pullRequest.state,
		isDraft: row.pullRequest.isDraft,
		baseBranch: sanitizeInlineText(row.pullRequest.baseBranch),
		isHistorical,
	};
}
