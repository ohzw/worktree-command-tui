import path from 'node:path';
import {readdir, readFile, stat} from 'node:fs/promises';

const MAX_LOG_BYTES = 16 * 1024;
const MAX_LOG_LINES = 120;

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

export async function readLogs(logsDir: string, activeLogPath: string | null): Promise<LogEntry[]> {
	try {
		const entries = (await readdir(logsDir, {withFileTypes: true}))
			.filter(entry => entry.isFile() && entry.name.endsWith('.log'))
			.map(entry => ({name: entry.name, path: path.join(logsDir, entry.name)}));

		if (entries.length === 0) {
			return [];
		}

		let selectedEntries = entries;
		if (activeLogPath !== null) {
			const activeEntry = entries.find(entry => entry.path === activeLogPath);
			if (activeEntry) {
				selectedEntries = [activeEntry];
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
				content: tailLogContent(await readFile(entry.path, 'utf8')),
			})),
		);
	} catch {
		return [];
	}
}
