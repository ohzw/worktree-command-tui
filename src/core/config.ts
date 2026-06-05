import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const CONFIG_FILE_NAME = '.worktree-command-tui.jsonc';
export const LEGACY_CONFIG_FILE_NAME = '.worktree-command-tui.json';
export const CONFIG_FILE_NAMES = [CONFIG_FILE_NAME, LEGACY_CONFIG_FILE_NAME] as const;

export interface ToolConfig {
	namespace: string;
	command: string[];
	setupCommand?: string[];
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

function readOptionalCommand(value: unknown, fieldName: string): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || value.length === 0 || value.some(part => !isNonEmptyString(part))) {
		throw new Error(`${fieldName} must be a non-empty string array when set`);
	}
	return value;
}

function stripJsoncComments(source: string): string {
	let result = '';
	let inString = false;
	let escaping = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < source.length; index += 1) {
		const current = source[index];
		const next = source[index + 1];

		if (inLineComment) {
			if (current === '\n' || current === '\r') {
				inLineComment = false;
				result += current;
			}
			continue;
		}

		if (inBlockComment) {
			if (current === '*' && next === '/') {
				inBlockComment = false;
				index += 1;
				continue;
			}
			result += current === '\n' || current === '\r' ? current : ' ';
			continue;
		}

		if (inString) {
			result += current;
			if (escaping) {
				escaping = false;
				continue;
			}
			if (current === '\\') {
				escaping = true;
				continue;
			}
			if (current === '"') {
				inString = false;
			}
			continue;
		}

		if (current === '"') {
			inString = true;
			result += current;
			continue;
		}
		if (current === '/' && next === '/') {
			inLineComment = true;
			index += 1;
			continue;
		}
		if (current === '/' && next === '*') {
			inBlockComment = true;
			index += 1;
			continue;
		}
		result += current;
	}

	return result;
}

function stripTrailingCommas(source: string): string {
	let result = '';
	let inString = false;
	let escaping = false;

	for (let index = 0; index < source.length; index += 1) {
		const current = source[index];

		if (inString) {
			result += current;
			if (escaping) {
				escaping = false;
				continue;
			}
			if (current === '\\') {
				escaping = true;
				continue;
			}
			if (current === '"') {
				inString = false;
			}
			continue;
		}

		if (current === '"') {
			inString = true;
			result += current;
			continue;
		}

		if (current === ',') {
			let lookahead = index + 1;
			while (lookahead < source.length && /\s/u.test(source[lookahead] ?? '')) {
				lookahead += 1;
			}
			if (source[lookahead] === '}' || source[lookahead] === ']') {
				continue;
			}
		}

		result += current;
	}

	return result;
}

export function parseJsonc(source: string): unknown {
	return JSON.parse(stripTrailingCommas(stripJsoncComments(source)));
}

async function readFirstConfig(repoRoot: string): Promise<string> {
	let firstError: unknown;
	for (const fileName of CONFIG_FILE_NAMES) {
		try {
			return await readFile(path.join(repoRoot, fileName), 'utf8');
		} catch (error) {
			firstError ??= error;
		}
	}
	throw firstError;
}

export async function loadToolConfig({repoRoot}: {repoRoot: string}): Promise<ToolConfig> {
	const raw = parseJsonc(await readFirstConfig(repoRoot)) as Partial<ToolConfig>;

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
		setupCommand: readOptionalCommand(raw.setupCommand, 'setupCommand'),
		port: raw.port,
		requiredFiles: readStringList(raw.requiredFiles, 'requiredFiles'),
		orphanMatchers: readStringList(raw.orphanMatchers, 'orphanMatchers'),
	};
}
