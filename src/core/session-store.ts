import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
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

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
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
		isPositiveInteger(record.pid) &&
		isPositiveInteger(record.pgid) &&
		isPositiveInteger(record.port) &&
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

export async function readSessionRecord(
	paths: Pick<SessionPaths, 'sessionFile'>,
	{isSessionAlive}: {isSessionAlive: (pgid: number) => Promise<boolean>},
): Promise<SessionRecord | null> {
	try {
		const parsed = JSON.parse(await readFile(paths.sessionFile, 'utf8')) as unknown;
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
