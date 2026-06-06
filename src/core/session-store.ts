import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

export interface SessionRecord {
	namespace: string;
	worktreePath: string;
	branch: string;
	pid: number;
	pgid: number;
	port: number;
	logPath: string;
	startedAt: string;
}

export interface SessionPaths {
	baseDir: string;
	logsDir: string;
	sessionFile: string;
}
const MAX_SESSION_BYTES = 16 * 1024;


function isSafeProcessId(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 1;
}

function isValidPort(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535;
}

function isSessionRecord(value: unknown): value is SessionRecord {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const record = value as Partial<SessionRecord>;
	return (
		typeof record.namespace === 'string' &&
		typeof record.worktreePath === 'string' &&
		typeof record.branch === 'string' &&
		isSafeProcessId(record.pid) &&
		isSafeProcessId(record.pgid) &&
		isValidPort(record.port) &&
		typeof record.logPath === 'string' &&
		typeof record.startedAt === 'string'
	);
}

export function getSessionPaths(gitCommonDir: string, namespace: string): SessionPaths {
	const baseDir = path.join(gitCommonDir, 'worktree-command-tui');
	return {
		baseDir,
		logsDir: path.join(baseDir, 'logs'),
		sessionFile: path.join(baseDir, `${namespace}.json`),
	};
}

async function readSessionFile(sessionFile: string): Promise<string | null> {
	if ((await stat(sessionFile)).size > MAX_SESSION_BYTES) {
		await rm(sessionFile, {force: true});
		return null;
	}
	return readFile(sessionFile, 'utf8');
}

export async function readSessionRecord(
	paths: Pick<SessionPaths, 'sessionFile'>,
	{isSessionAlive}: {isSessionAlive: (pgid: number) => Promise<boolean>},
): Promise<SessionRecord | null> {
	try {
		const source = await readSessionFile(paths.sessionFile);
		if (source === null) {
			return null;
		}
		const parsed = JSON.parse(source) as unknown;
		if (!isSessionRecord(parsed)) {
			await rm(paths.sessionFile, {force: true});
			return null;
		}
		if (!(await isSessionAlive(parsed.pgid))) {
			await rm(paths.sessionFile, {force: true});
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export async function writeSessionRecord(
	paths: Pick<SessionPaths, 'baseDir' | 'sessionFile'>,
	record: SessionRecord,
): Promise<void> {
	await mkdir(paths.baseDir, {recursive: true});
	await writeFile(paths.sessionFile, JSON.stringify(record, null, 2));
}

export async function clearSessionRecord(paths: Pick<SessionPaths, 'sessionFile'>): Promise<void> {
	await rm(paths.sessionFile, {force: true});
}
