import {existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {runCommandToLog, startDetachedCommand} from './command-runner.js';

async function waitForLogContent(logPath: string, expected: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			if (readFileSync(logPath, 'utf8').includes(expected)) {
				return;
			}
		} catch {}
		await new Promise(resolve => {
			setTimeout(resolve, 25);
		});
	}
	expect(readFileSync(logPath, 'utf8')).toContain(expected);
}


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

	it('asks commands to keep color when writing to log files', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-color-'));
		const previousForceColor = process.env.FORCE_COLOR;
		const previousCliColorForce = process.env.CLICOLOR_FORCE;
		delete process.env.FORCE_COLOR;
		delete process.env.CLICOLOR_FORCE;

		try {
			const result = await runCommandToLog({
				command: ['node', '-e', 'console.log(`${process.env.FORCE_COLOR}:${process.env.CLICOLOR_FORCE}`)'],
				cwd: root,
				logsDir: path.join(root, 'logs'),
				logFileBase: 'feat-a.setup',
			});

			expect(readFileSync(result.logPath, 'utf8')).toContain('1:1');
		} finally {
			if (previousForceColor === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = previousForceColor;
			}
			if (previousCliColorForce === undefined) {
				delete process.env.CLICOLOR_FORCE;
			} else {
				process.env.CLICOLOR_FORCE = previousCliColorForce;
			}
		}
	});

	it('preserves explicit color environment values', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-color-explicit-'));
		const previousForceColor = process.env.FORCE_COLOR;
		const previousCliColorForce = process.env.CLICOLOR_FORCE;
		process.env.FORCE_COLOR = '0';
		process.env.CLICOLOR_FORCE = 'custom';

		try {
			const result = await runCommandToLog({
				command: ['node', '-e', 'console.log(`${process.env.FORCE_COLOR}:${process.env.CLICOLOR_FORCE}`)'],
				cwd: root,
				logsDir: path.join(root, 'logs'),
				logFileBase: 'feat-a.setup',
			});

			expect(readFileSync(result.logPath, 'utf8')).toContain('0:custom');
		} finally {
			if (previousForceColor === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = previousForceColor;
			}
			if (previousCliColorForce === undefined) {
				delete process.env.CLICOLOR_FORCE;
			} else {
				process.env.CLICOLOR_FORCE = previousCliColorForce;
			}
		}
	});


	it('asks detached commands to keep color when writing to log files', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-detached-color-'));
		const previousForceColor = process.env.FORCE_COLOR;
		const previousCliColorForce = process.env.CLICOLOR_FORCE;
		delete process.env.FORCE_COLOR;
		delete process.env.CLICOLOR_FORCE;

		try {
			const result = await startDetachedCommand({
				command: ['node', '-e', 'console.log(`${process.env.FORCE_COLOR}:${process.env.CLICOLOR_FORCE}`)'],
				cwd: root,
				logsDir: path.join(root, 'logs'),
				logFileBase: 'feat-a',
			});

			await waitForLogContent(result.logPath, '1:1');
		} finally {
			if (previousForceColor === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = previousForceColor;
			}
			if (previousCliColorForce === undefined) {
				delete process.env.CLICOLOR_FORCE;
			} else {
				process.env.CLICOLOR_FORCE = previousCliColorForce;
			}
		}
	});

	it('preserves explicit color environment values for detached commands', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-command-detached-color-explicit-'));
		const previousForceColor = process.env.FORCE_COLOR;
		const previousCliColorForce = process.env.CLICOLOR_FORCE;
		process.env.FORCE_COLOR = '0';
		process.env.CLICOLOR_FORCE = 'custom';

		try {
			const result = await startDetachedCommand({
				command: ['node', '-e', 'console.log(`${process.env.FORCE_COLOR}:${process.env.CLICOLOR_FORCE}`)'],
				cwd: root,
				logsDir: path.join(root, 'logs'),
				logFileBase: 'feat-a',
			});

			await waitForLogContent(result.logPath, '0:custom');
		} finally {
			if (previousForceColor === undefined) {
				delete process.env.FORCE_COLOR;
			} else {
				process.env.FORCE_COLOR = previousForceColor;
			}
			if (previousCliColorForce === undefined) {
				delete process.env.CLICOLOR_FORCE;
			} else {
				process.env.CLICOLOR_FORCE = previousCliColorForce;
			}
		}
	});


	it('copies root-scoped files into the selected worktree without spawning a child process', async () => {
		const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-root-'));
		const worktreeRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-worktree-'));
		writeFileSync(path.join(workspaceRoot, '.env.example'), 'API_URL=http://localhost\n');

		const result = await runCommandToLog({
			command: ['copy-root-file', '.env.example', '.env'],
			cwd: worktreeRoot,
			logsDir: path.join(worktreeRoot, 'logs'),
			logFileBase: 'feat-a.setup',
			workspaceRoot,
		});

		expect(readFileSync(path.join(worktreeRoot, '.env'), 'utf8')).toBe('API_URL=http://localhost\n');
		expect(readFileSync(result.logPath, 'utf8')).toContain('copied ');
	});

	it('rejects copy-root-file path escapes before copying', async () => {
		const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-root-'));
		const worktreeRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-worktree-'));
		const outsidePath = path.join(tmpdir(), `wctui-outside-${Date.now()}`);
		writeFileSync(path.join(workspaceRoot, '.env.example'), 'API_URL=http://localhost\n');

		await expect(runCommandToLog({
			command: ['copy-root-file', '.env.example', outsidePath],
			cwd: worktreeRoot,
			logsDir: path.join(worktreeRoot, 'logs'),
			logFileBase: 'feat-a.setup',
			workspaceRoot,
		})).rejects.toThrow('destination must stay under');
		expect(existsSync(outsidePath)).toBe(false);

		await expect(runCommandToLog({
			command: ['copy-root-file', '../outside.env', '.env'],
			cwd: worktreeRoot,
			logsDir: path.join(worktreeRoot, 'logs'),
			logFileBase: 'feat-b.setup',
			workspaceRoot,
		})).rejects.toThrow('source must stay under');
	});

	it('rejects copy-root-file symlink escapes before copying', async () => {
		const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-root-'));
		const worktreeRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-worktree-'));
		const outsideRoot = mkdtempSync(path.join(tmpdir(), 'wctui-command-copy-outside-'));
		const outsideSource = path.join(outsideRoot, 'secret.env');
		const outsideDestinationDir = path.join(outsideRoot, 'dest');
		const outsideDestination = path.join(outsideDestinationDir, '.env');
		mkdirSync(outsideDestinationDir);
		writeFileSync(outsideSource, 'SECRET=true\n');
		symlinkSync(outsideSource, path.join(workspaceRoot, 'linked-source'));
		writeFileSync(path.join(workspaceRoot, '.env.example'), 'SAFE=true\n');
		symlinkSync(outsideDestinationDir, path.join(worktreeRoot, 'linked-dest'));

		await expect(runCommandToLog({
			command: ['copy-root-file', 'linked-source', '.env'],
			cwd: worktreeRoot,
			logsDir: path.join(worktreeRoot, 'logs'),
			logFileBase: 'feat-a.setup',
			workspaceRoot,
		})).rejects.toThrow('source must stay under');

		await expect(runCommandToLog({
			command: ['copy-root-file', '.env.example', 'linked-dest/.env'],
			cwd: worktreeRoot,
			logsDir: path.join(worktreeRoot, 'logs'),
			logFileBase: 'feat-b.setup',
			workspaceRoot,
		})).rejects.toThrow('destination must stay under');
		expect(existsSync(outsideDestination)).toBe(false);
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
