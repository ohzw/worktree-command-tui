import path from 'node:path';
import {open, readdir, stat} from 'node:fs/promises';

const MAX_LOG_BYTES = 16 * 1024;
const MAX_LOG_LINES = 120;
const MAX_LOG_FILES = 100;

export interface LogEntry {
	name: string;
	path: string;
	content: string;
}

export function tailLogContent(content: string): string {
	const byteTrimmed = content.length > MAX_LOG_BYTES ? content.slice(-MAX_LOG_BYTES) : content;
	const lines = byteTrimmed.replace(/\r\n/g, '\n').split('\n');
	const tailLines = lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines;
	return tailLines.join('\n').trimEnd();
}

async function readLogTail(filePath: string): Promise<string> {
	const stats = await stat(filePath);
	const bytesToRead = Math.min(stats.size, MAX_LOG_BYTES);
	const buffer = Buffer.alloc(bytesToRead);
	const file = await open(filePath, 'r');
	try {
		await file.read(buffer, 0, bytesToRead, Math.max(0, stats.size - bytesToRead));
	} finally {
		await file.close();
	}
	return buffer.toString('utf8');
}


export async function readLogs(logsDir: string, activeLogPath: string | null): Promise<LogEntry[]> {
	try {
		const entries = (await readdir(logsDir, {withFileTypes: true}))
			.filter(entry => entry.isFile() && entry.name.endsWith('.log'))
			.slice(0, MAX_LOG_FILES)
			.map(entry => ({name: entry.name, path: path.join(logsDir, entry.name)}));

		if (entries.length === 0) {
			return [];
		}

		let selectedEntries = entries;
		if (activeLogPath !== null) {
			const activeEntry = entries.find(entry => entry.path === activeLogPath);
			selectedEntries = activeEntry ? [activeEntry] : [];
			if (selectedEntries.length === 0) {
				return [];
			}
		} else {
			const withStats = await Promise.all(
				entries.map(async entry => ({
					...entry,
					mtimeMs: (await stat(entry.path)).mtimeMs,
				})),
			);
			withStats.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
			selectedEntries = [withStats[0]!];
		}

		return await Promise.all(
			selectedEntries.map(async entry => ({
				name: entry.name,
				path: entry.path,
				content: tailLogContent(await readLogTail(entry.path)),
			})),
		);
	} catch {
		return [];
	}
}
