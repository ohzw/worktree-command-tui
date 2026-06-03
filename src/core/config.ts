import {readFile} from 'node:fs/promises';
import path from 'node:path';

export interface ToolConfig {
	namespace: string;
	command: string[];
	port: number;
	requiredFiles: string[];
	orphanMatchers: string[];
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isSafeNamespace(value: unknown): value is string {
	return isNonEmptyString(value) && /^[A-Za-z0-9._-]+$/u.test(value);
}

function readStringList(value: unknown, fieldName: string): string[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value) || value.some(item => !isNonEmptyString(item))) {
		throw new Error(`${fieldName} must be a string array`);
	}
	return value;
}

export async function loadToolConfig({repoRoot}: {repoRoot: string}): Promise<ToolConfig> {
	const filePath = path.join(repoRoot, '.worktree-command-tui.json');
	const raw = JSON.parse(await readFile(filePath, 'utf8')) as Partial<ToolConfig>;

	if (!Array.isArray(raw.command) || raw.command.length === 0 || raw.command.some(part => !isNonEmptyString(part))) {
		throw new Error('command must be a non-empty string array');
	}
	if (!isSafeNamespace(raw.namespace)) {
		throw new Error('namespace must match [A-Za-z0-9._-]+');
	}
	if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) {
		throw new Error('port must be an integer between 1 and 65535');
	}

	return {
		namespace: raw.namespace,
		command: raw.command,
		port: raw.port,
		requiredFiles: readStringList(raw.requiredFiles, 'requiredFiles'),
		orphanMatchers: readStringList(raw.orphanMatchers, 'orphanMatchers'),
	};
}
