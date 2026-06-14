import {appendFileSync, closeSync, copyFileSync, mkdirSync, openSync, realpathSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';

interface CommandLogOptions {
	command: string[];
	cwd: string;
	logsDir: string;
	logFileBase: string;
	errorLabel?: string;
	workspaceRoot?: string;
}

function writeLogLine(logPath: string, text: string): void {
	appendFileSync(logPath, text, 'utf8');
}

function isContainedPath(root: string, target: string, allowEqual: boolean): boolean {
	const relativePath = path.relative(root, target);
	return (allowEqual && relativePath === '') || (relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveSourcePath(root: string, inputPath: string): string {
	const realRoot = realpathSync(root);
	const source = path.resolve(realRoot, inputPath);
	if (!isContainedPath(realRoot, source, false)) {
		throw new Error(`source must stay under ${realRoot}`);
	}
	const realSource = realpathSync(source);
	if (!isContainedPath(realRoot, realSource, false)) {
		throw new Error(`source must stay under ${realRoot}`);
	}
	return realSource;
}

function resolveDestinationPath(root: string, inputPath: string): string {
	const realRoot = realpathSync(root);
	const destination = path.resolve(realRoot, inputPath);
	const basename = path.basename(destination);
	if (basename === '' || basename === '.' || basename === '..') {
		throw new Error(`destination must stay under ${realRoot}`);
	}
	mkdirSync(path.dirname(destination), {recursive: true});
	const realParent = realpathSync(path.dirname(destination));
	if (!isContainedPath(realRoot, realParent, true)) {
		throw new Error(`destination must stay under ${realRoot}`);
	}
	return path.join(realParent, basename);
}

function runBuiltInCommand(input: {command: string[]; cwd: string; logPath: string; workspaceRoot: string | undefined; errorLabel: string}): boolean {
	if (input.command[0] !== 'copy-root-file') {
		return false;
	}

	if (input.command.length !== 3) {
		throw new Error(`${input.errorLabel} requires arguments: source and destination path`);
	}

	if (input.workspaceRoot === undefined) {
		throw new Error(`${input.errorLabel} copy-root-file requires workspaceRoot`);
	}

	const source = resolveSourcePath(input.workspaceRoot, input.command[1] ?? '');
	const destination = resolveDestinationPath(input.cwd, input.command[2] ?? '');
	copyFileSync(source, destination);
	writeLogLine(input.logPath, `copied ${source} -> ${destination}\n`);
	return true;
}

function getLogEnvironment(): NodeJS.ProcessEnv {
	return {
		...process.env,
		FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
		CLICOLOR_FORCE: process.env.CLICOLOR_FORCE ?? '1',
	};
}

export function runCommandToLog({
	command,
	cwd,
	logsDir,
	logFileBase,
	errorLabel = 'setup command',
	workspaceRoot,
}: CommandLogOptions): Promise<{logPath: string}> {
	mkdirSync(logsDir, {recursive: true});
	const logPath = path.join(logsDir, `${logFileBase}.log`);
	const fd = openSync(logPath, 'a');
	const {promise, resolve, reject} = Promise.withResolvers<{logPath: string}>();
	let settled = false;

	const finalize = () => {
		if (settled) {
			return false;
		}
		settled = true;
		closeSync(fd);
		return true;
	};

	try {
		if (runBuiltInCommand({command, cwd, logPath, workspaceRoot, errorLabel})) {
			if (finalize()) {
				resolve({logPath});
			}
			return promise;
		}
	} catch (error) {
		if (finalize()) {
			reject(new Error(`${errorLabel}: ${error instanceof Error ? error.message : String(error)}; see ${logPath}`));
		}
		return promise;
	}

	const child = spawn(command[0]!, command.slice(1), {
		cwd,
		env: getLogEnvironment(),
		stdio: ['ignore', fd, fd],
	});

	child.once('error', error => {
		if (finalize()) {
			reject(error);
		}
	});
	child.once('exit', (code, signal) => {
		if (!finalize()) {
			return;
		}
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
		env: getLogEnvironment(),
		stdio: ['ignore', fd, fd],
	});

	const finalize = () => {
		if (settled) {
			return false;
		}
		settled = true;
		closeSync(fd);
		return true;
	};

	child.once('error', error => {
		if (finalize()) {
			reject(error);
		}
	});
	child.once('spawn', () => {
		const pid = child.pid;
		if (pid === undefined) {
			if (finalize()) {
				reject(new Error('spawn succeeded without pid'));
			}
			return;
		}
		child.unref();
		if (finalize()) {
			resolve({pid, pgid: pid, logPath});
		}
	});

	return promise;
}
