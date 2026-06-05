import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {buildActions, parseGitStatusSummary, toAppRow} from './runtime.js';


function initGitRepo(root: string): void {
	execFileSync('git', ['init'], {cwd: root});
	execFileSync('git', ['config', 'user.email', 'wctui@example.invalid'], {cwd: root});
	execFileSync('git', ['config', 'user.name', 'wctui test'], {cwd: root});
	writeFileSync(path.join(root, 'README.md'), 'test repo\n');
	execFileSync('git', ['add', 'README.md'], {cwd: root});
	execFileSync('git', ['commit', '-m', 'initial'], {cwd: root});
}
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

describe('buildActions setup command', () => {
	it('runs setup manually and returns the setup log', async () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'wctui-runtime-setup-')));
		initGitRepo(root);
		writeFileSync(path.join(root, 'package.json'), '{}');
		writeFileSync(path.join(root, '.worktree-command-tui.jsonc'), JSON.stringify({
			namespace: 'runtime-setup',
			command: ['node', '-e', 'require("node:fs").writeFileSync("started.txt", "yes")'],
			setupCommand: ['node', '-e', 'console.log("setup output")'],
			port: 31234,
			requiredFiles: ['package.json'],
			orphanMatchers: [],
		}));

		const actions = await buildActions(root);
		const model = await actions.setup(root);

		expect(model.status.message).toMatch(/^setup complete for /u);
		expect(model.logs[0]?.content).toContain('setup output');
	});

	it('does not run setup when starting a worktree', async () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'wctui-runtime-start-')));
		initGitRepo(root);
		writeFileSync(path.join(root, 'package.json'), '{}');
		writeFileSync(path.join(root, '.worktree-command-tui.jsonc'), JSON.stringify({
			namespace: 'runtime-start',
			command: ['node', '-e', 'require("node:fs").writeFileSync("started.txt", "yes")'],
			setupCommand: ['node', '-e', 'require("node:fs").writeFileSync("setup.txt", "no")'],
			port: 31235,
			requiredFiles: ['package.json'],
			orphanMatchers: [],
		}));

		const actions = await buildActions(root);
		await actions.start(root);

		await vi.waitFor(() => expect(existsSync(path.join(root, 'started.txt'))).toBe(true));
		expect(existsSync(path.join(root, 'setup.txt'))).toBe(false);
	});
});

	it('keeps running status after setup when a session is active', async () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'wctui-runtime-active-')));
		initGitRepo(root);
		writeFileSync(path.join(root, 'package.json'), '{}');
		writeFileSync(path.join(root, '.worktree-command-tui.jsonc'), JSON.stringify({
			namespace: 'runtime-active',
			command: ['node', '-e', 'setInterval(() => {}, 1000)'],
			setupCommand: ['node', '-e', 'console.log("setup while active")'],
			port: 31236,
			requiredFiles: ['package.json'],
			orphanMatchers: [],
		}));

		const actions = await buildActions(root);
		await actions.start(root);
		const model = await actions.setup(root);
		await actions.stop();

		expect(model.activePath).toBe(root);
		expect(model.status.kind).toBe('running');
		expect(model.status.message).toMatch(/^setup complete for /u);
		expect(model.logs[0]?.content).toContain('setup while active');
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
