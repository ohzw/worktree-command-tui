import {describe, expect, it} from 'vitest';
import {parseGitStatusSummary, toAppRow} from './runtime.js';

describe('parseGitStatusSummary', () => {
	it('parses upstream, ahead/behind counts, and worktree dirtiness', () => {
		const summary = parseGitStatusSummary(`
# branch.oid 46af3f1cec1c61a50aa178552c55b5c6c3e5575e
# branch.head feat/worktree-command-tui
# branch.upstream origin/develop
# branch.ab +4 -24
1 MM N... 100644 100644 100644 abc def src/app.tsx
2 .M N... 100644 100644 100644 100644 abc def R100 src/old.tsx	src/new.tsx
u UU N... 100644 100644 100644 100644 100644 abc def ghi src/conflicted.ts
? src/untracked.ts
`);

		expect(summary.upstreamUnavailable).toBe(false);
		expect(summary.upstream).toEqual({branch: 'origin/develop', ahead: 4, behind: 24});
		expect(summary.workingTree).toEqual({staged: 1, unstaged: 2, untracked: 1, conflicts: 1});
	});

	it('keeps no-upstream branches distinct from unavailable metadata', () => {
		const summary = parseGitStatusSummary(`
# branch.oid 46af3f1cec1c61a50aa178552c55b5c6c3e5575e
# branch.head feat/worktree-command-tui
`);

		expect(summary.upstreamUnavailable).toBe(false);
		expect(summary.upstream).toBeUndefined();
		expect(summary.workingTree).toEqual({staged: 0, unstaged: 0, untracked: 0, conflicts: 0});
	});
});

describe('toAppRow', () => {
	it('preserves collected metadata in the rendered row', () => {
		const row = toAppRow(
			'/repo',
			{
				path: '/repo/.worktree/feat-a',
				branch: 'feat/a',
				headSha: '46af3f1cec1c61a50aa178552c55b5c6c3e5575e',
				isMain: false,
				isExternal: false,
			},
			null,
			null,
			{
				upstreamUnavailable: true,
				workingTree: {staged: 0, unstaged: 1, untracked: 2, conflicts: 0},
				pullRequest: {
					kind: 'found',
					number: 2125,
					title: 'Selection pane metadata',
					url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125',
					state: 'OPEN',
					isDraft: true,
					baseBranch: 'develop',
				},
			},
		);

		expect(row.upstreamUnavailable).toBe(true);
		expect(row.workingTree).toEqual({staged: 0, unstaged: 1, untracked: 2, conflicts: 0});
		expect(row.pullRequest).toEqual({
			kind: 'found',
			number: 2125,
			title: 'Selection pane metadata',
			url: 'https://github.com/finn-inc/reclaim-the-forest/pull/2125',
			state: 'OPEN',
			isDraft: true,
			baseBranch: 'develop',
		});
		expect(row.headSha).toBe('46af3f1c');
		expect(row.shortPath).toBe('.worktree/feat-a');
	});
});
