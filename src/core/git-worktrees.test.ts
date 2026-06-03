import {describe, expect, it} from 'vitest';
import {parseWorktreeListPorcelain, sortWorktrees, toShortPath} from './git-worktrees.js';

const porcelain = `worktree /repo
HEAD aaa
branch refs/heads/develop

worktree /repo/.worktree/feat-a
HEAD bbb
branch refs/heads/feat/a

worktree /repo-other
HEAD ccc
branch refs/heads/fix/x
`;

describe('parseWorktreeListPorcelain', () => {
	it('parses branch name, absolute path, and external flag with path boundaries', () => {
		const rows = parseWorktreeListPorcelain(porcelain, '/repo');
		expect(rows.map(row => row.branch)).toEqual(['develop', 'feat/a', 'fix/x']);
		expect(rows[0]?.isMain).toBe(true);
		expect(rows[2]?.isExternal).toBe(true);
	});
});

describe('sortWorktrees', () => {
	it('keeps main first, active second, then branch asc', () => {
		const rows = parseWorktreeListPorcelain(porcelain, '/repo');
		const sorted = sortWorktrees(rows, '/repo-other');
		expect(sorted.map(row => row.path)).toEqual(['/repo', '/repo-other', '/repo/.worktree/feat-a']);
	});
});

describe('toShortPath', () => {
	it('shortens repo-local paths and keeps external paths absolute', () => {
		expect(toShortPath('/repo', '/repo')).toBe('.');
		expect(toShortPath('/repo', '/repo/.worktree/feat-a')).toBe('.worktree/feat-a');
		expect(toShortPath('/repo', '/repo-other')).toBe('/repo-other');
	});
});
