import {describe, expect, it} from 'vitest';
import {
	getOrderedNonActiveTags,
	projectAction,
	projectHeadCommit,
	projectNote,
	projectPullRequest,
	projectWorktreeListRow,
	projectWorkingTree,
	projectUpstream,
	sanitizeInlineText,
} from './worktree-projection.js';
import type {AppRow} from './runtime.js';

function makeRow(overrides: Partial<AppRow> = {}): AppRow {
	return {
		path: '/repo/.worktree/feat-a',
		shortPath: '.worktree/feat-a',
		branch: 'feat/a',
		tags: [],
		...overrides,
	};
}

describe('sanitizeInlineText', () => {
	it('normalizes inline TUI text without preserving control characters', () => {
		expect(sanitizeInlineText(' feature\n\tbranch\u200B  name\u0007 ')).toBe('feature branch name');
	});
});

describe('projectHeadCommit', () => {
	it('produces a sanitized head summary from the short hash and commit message', () => {
		expect(projectHeadCommit(makeRow({
			headSha: '46af3f1c',
			headCommit: {message: 'Selection\npane\u001b[2J metadata'},
		}))).toEqual({
			kind: 'found',
			hash: '46af3f1c',
			message: 'Selection pane metadata',
			label: '46af3f1c Selection pane metadata',
		});
	});

	it('treats missing commit metadata as unavailable', () => {
		expect(projectHeadCommit(makeRow())).toEqual({kind: 'unavailable'});
	});
});

describe('projectWorktreeListRow', () => {
	it('projects active, selected, invalid, external, and main list semantics without presentation copy', () => {
		expect(projectWorktreeListRow(makeRow({tags: ['active']}), false)).toEqual({state: 'active', isSelected: false, isMain: false});
		expect(projectWorktreeListRow(makeRow(), true)).toEqual({state: 'normal', isSelected: true, isMain: false});
		expect(projectWorktreeListRow(makeRow({tags: ['invalid']}), false)).toEqual({state: 'invalid', isSelected: false, isMain: false});
		expect(projectWorktreeListRow(makeRow({tags: ['external']}), false)).toEqual({state: 'external', isSelected: false, isMain: false});
		expect(projectWorktreeListRow(makeRow({tags: ['main']}), false)).toEqual({state: 'normal', isSelected: false, isMain: true});
	});
});

describe('getOrderedNonActiveTags', () => {
	it('removes active and orders known tags before unknown tags without presentation copy', () => {
		expect(getOrderedNonActiveTags(['legacy', 'invalid', 'active', 'main', 'external'])).toEqual([
			{tag: 'main'},
			{tag: 'external'},
			{tag: 'invalid'},
			{tag: 'legacy'},
		]);
	});
});

describe('projectAction', () => {
	it('classifies blocked, active, conflicted, dirty, and startable rows', () => {
		expect(projectAction(makeRow({invalidReason: 'Missing required files'}), null)).toEqual({kind: 'blocked', severity: 'error'});
		expect(projectAction(makeRow(), '/repo/.worktree/feat-a')).toEqual({kind: 'active', severity: 'success'});
		expect(projectAction(makeRow({workingTree: {staged: 0, unstaged: 0, untracked: 0, conflicts: 1}}), null)).toEqual({kind: 'startable', severity: 'error'});
		expect(projectAction(makeRow({workingTree: {staged: 1, unstaged: 0, untracked: 0, conflicts: 0}}), null)).toEqual({kind: 'startable', severity: 'info'});
		expect(projectAction(makeRow(), null)).toEqual({kind: 'startable', severity: 'info'});
	});
});

describe('projectNote', () => {
	it('classifies note semantics without owning sentence copy', () => {
		expect(projectNote(makeRow({invalidReason: 'Missing required files'}))).toEqual({kind: 'invalid', severity: 'error', invalidReason: 'Missing required files'});
		expect(projectNote(makeRow({tags: ['external']}))).toEqual({kind: 'external', severity: 'info'});
		expect(projectNote(makeRow({workingTree: {staged: 0, unstaged: 0, untracked: 0, conflicts: 1}}))).toEqual({kind: 'ready', severity: 'error'});
		expect(projectNote(makeRow())).toEqual({kind: 'ready', severity: 'info'});
	});

	it('sanitizes invalid reasons before projecting them for display', () => {
		expect(projectNote(makeRow({invalidReason: 'Missing\u001b]0;owned\u0007\npackage.json\u202E'}))).toEqual({
			kind: 'invalid',
			severity: 'error',
			invalidReason: 'Missing package.json',
		});
	});
});

describe('projectUpstream', () => {
	it('projects upstream availability and sanitized branch details', () => {
		expect(projectUpstream(makeRow({upstreamUnavailable: true}))).toEqual({kind: 'unavailable'});
		expect(projectUpstream(makeRow())).toEqual({kind: 'none'});
		expect(projectUpstream(makeRow({upstream: {branch: 'origin/feat\n', ahead: 2, behind: 3}}))).toEqual({kind: 'found', branch: 'origin/feat', ahead: 2, behind: 3});
	});
});

describe('projectWorkingTree', () => {
	it('projects unavailable, clean, and ordered dirty status parts', () => {
		expect(projectWorkingTree(makeRow())).toEqual({kind: 'unavailable'});
		expect(projectWorkingTree(makeRow({workingTree: {staged: 0, unstaged: 0, untracked: 0, conflicts: 0}}))).toEqual({kind: 'clean'});
		expect(projectWorkingTree(makeRow({workingTree: {staged: 2, unstaged: 3, untracked: 4, conflicts: 5}}))).toEqual({
			kind: 'dirty',
			parts: [
				{kind: 'staged', count: 2},
				{kind: 'unstaged', count: 3},
				{kind: 'untracked', count: 4},
				{kind: 'conflicts', count: 5},
			],
		});
	});
});

describe('projectPullRequest', () => {
	it('projects PR semantic state and sanitized display fields without labels or styling', () => {
		expect(projectPullRequest(makeRow())).toEqual({kind: 'none'});
		expect(projectPullRequest(makeRow({pullRequest: {kind: 'unavailable'}}))).toEqual({kind: 'unavailable'});
		expect(projectPullRequest(makeRow({pullRequest: {kind: 'found', number: 7, title: 'Ready\n now', url: 'https://example.com/7', state: 'OPEN', isDraft: true, baseBranch: 'develop\tbranch'}}))).toEqual({
			kind: 'found',
			number: 7,
			title: 'Ready now',
			state: 'OPEN',
			isDraft: true,
			baseBranch: 'develop branch',
			isHistorical: false,
		});
		expect(projectPullRequest(makeRow({pullRequest: {kind: 'found', number: 8, title: 'Merged', url: 'https://example.com/8', state: 'MERGED', isDraft: false, baseBranch: 'main'}}))).toMatchObject({isHistorical: true});
	});
});
