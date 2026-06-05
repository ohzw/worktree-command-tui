import {closeSync, mkdirSync, openSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';

interface CommandLogOptions {
	command: string[];
	cwd: string;
	logsDir: string;
	logFileBase: string;
	errorLabel?: string;
}

export function runCommandToLog({
	command,
	cwd,
	logsDir,
	logFileBase,
	errorLabel = 'setup command',
}: CommandLogOptions): Promise<{logPath: string}> {
	mkdirSync(logsDir, {recursive: true});
	const logPath = path.join(logsDir, `${logFileBase}.log`);
	const fd = openSync(logPath, 'a');
	const {promise, resolve, reject} = Promise.withResolvers<{logPath: string}>();
	let settled = false;

	const finalize = () => {
		if (settled) {
			return;
		}
		settled = true;
		closeSync(fd);
	};

	const child = spawn(command[0]!, command.slice(1), {
		cwd,
		stdio: ['ignore', fd, fd],
	});

	child.once('error', error => {
		finalize();
		reject(error);
	});
	child.once('exit', (code, signal) => {
		finalize();
		if (code === 0) {
			resolve({logPath});
			return;
		}
		if (code !== null) {
			reject(new Error(`${errorLabel} exited with code ${code}; see ${logPath}`));
			return;
		}
		reject(new Error(`${errorLabel} exited due to signal ${signal ?? 'unknown'}; see ${logPath}`));
	});

	return promise;
}

export function startDetachedCommand({
	command,
	cwd,
	logsDir,
	logFileBase,
}: {
	command: string[];
	cwd: string;
	logsDir: string;
	logFileBase: string;
}): Promise<{pid: number; pgid: number; logPath: string}> {
	mkdirSync(logsDir, {recursive: true});
	const logPath = path.join(logsDir, `${logFileBase}.log`);
	const fd = openSync(logPath, 'a');
	const {promise, resolve, reject} = Promise.withResolvers<{pid: number; pgid: number; logPath: string}>();
	let settled = false;

	const child = spawn(command[0]!, command.slice(1), {
		cwd,
		detached: true,
		stdio: ['ignore', fd, fd],
	});

	const finalize = () => {
		if (settled) {
			return;
		}
		settled = true;
		closeSync(fd);
	};

	child.once('error', error => {
		finalize();
		reject(error);
	});
	child.once('spawn', () => {
		const pid = child.pid;
		if (pid === undefined) {
			finalize();
			reject(new Error('spawn succeeded without pid'));
			return;
		}
		child.unref();
		finalize();
		resolve({pid, pgid: pid, logPath});
	});

	return promise;
}
