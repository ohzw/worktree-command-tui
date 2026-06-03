import {describe, expect, it} from 'vitest';
import {getActionColor, getPullRequestColor} from './ActionPanel.js';
import type {AppRow} from '../core/runtime.js';

function makeRow(overrides: Partial<AppRow> = {}): AppRow {
	return {
		path: '/repo/.worktree/feat-a',
		shortPath: '.worktree/feat-a',
		branch: 'feat/a',
		tags: [],
		...overrides,
	};
}

describe('getPullRequestColor', () => {
	it('uses green for open PRs, yellow for drafts, red for unavailable, and neutral otherwise', () => {
		expect(getPullRequestColor(makeRow({pullRequest: {kind: 'found', number: 1, title: 'Ready', url: 'https://example.com/1', state: 'OPEN', isDraft: false, baseBranch: 'develop'}}))).toBe('green');
		expect(getPullRequestColor(makeRow({pullRequest: {kind: 'found', number: 2, title: 'Draft', url: 'https://example.com/2', state: 'OPEN', isDraft: true, baseBranch: 'develop'}}))).toBe('yellow');
		expect(getPullRequestColor(makeRow({pullRequest: {kind: 'unavailable'}}))).toBe('red');
		expect(getPullRequestColor(makeRow({pullRequest: {kind: 'found', number: 3, title: 'Merged', url: 'https://example.com/3', state: 'MERGED', isDraft: false, baseBranch: 'develop'}}))).toBeUndefined();
		expect(getPullRequestColor(makeRow({pullRequest: {kind: 'none'}}))).toBeUndefined();
	});
});

describe('getActionColor', () => {
	it('reserves warning colors for invalid, conflicted, and dirty worktrees', () => {
		expect(getActionColor(makeRow({invalidReason: 'Missing required files'}))).toBe('red');
		expect(getActionColor(makeRow({workingTree: {staged: 0, unstaged: 0, untracked: 0, conflicts: 1}}))).toBe('red');
		expect(getActionColor(makeRow({workingTree: {staged: 1, unstaged: 0, untracked: 0, conflicts: 0}}))).toBe('yellow');
		expect(getActionColor(makeRow({workingTree: {staged: 0, unstaged: 1, untracked: 0, conflicts: 0}}))).toBe('yellow');
		expect(getActionColor(makeRow({workingTree: {staged: 0, unstaged: 0, untracked: 1, conflicts: 0}}))).toBe('yellow');
		expect(getActionColor(makeRow({tags: ['active']}))).toBeUndefined();
		expect(getActionColor(makeRow())).toBeUndefined();
	});
});
