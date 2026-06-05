import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {runCommandToLog} from './command-runner.js';

describe('runCommandToLog', () => {
	it('runs a command in the target worktree and captures output', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-'));

		const result = await runCommandToLog({
			command: ['node', '-e', 'console.log(process.cwd()); console.error("setup ok")'],
			cwd: root,
			logsDir: path.join(root, 'logs'),
			logFileBase: 'feat-a.setup',
		});

		expect(result.logPath).toBe(path.join(root, 'logs', 'feat-a.setup.log'));
		expect(readFileSync(result.logPath, 'utf8')).toContain(root);
		expect(readFileSync(result.logPath, 'utf8')).toContain('setup ok');
	});

	it('rejects with the exit code and log path when the command fails', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-fail-'));

		await expect(runCommandToLog({
			command: ['node', '-e', 'process.exit(7)'],
			cwd: root,
			logsDir: path.join(root, 'logs'),
			logFileBase: 'feat-a.setup',
		})).rejects.toThrow(/setup command exited with code 7; see .+feat-a\.setup\.log/u);
	});
});
