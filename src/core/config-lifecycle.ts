import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CONFIG_FILE_NAME, CONFIG_FILE_NAMES, parseJsonc, type ToolConfig} from './config.js';

const SAFE_NAMESPACE_PATTERN = /^[A-Za-z0-9._-]+$/u;
const UNSAFE_NAMESPACE_RUN_PATTERN = /[^A-Za-z0-9._-]+/gu;
const LEADING_NAMESPACE_HYPHENS_PATTERN = /^-+/u;
const TRAILING_NAMESPACE_HYPHENS_PATTERN = /-+$/u;
const SAFE_NAMESPACE_DESCRIPTION = '[A-Za-z0-9._-]+';
const DEFAULT_NAMESPACE = 'worktree-command-tui';

export interface DefaultToolConfigOptions {
	namespaceSeed: string;
	packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm';
	script: string;
}

export interface ConfigInitResult {
	path: string;
	config: ToolConfig;
}

export interface ConfigInitOptions {
	workspaceRoot: string;
	force: boolean;
	config: ToolConfig;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function isSafeNamespace(value: unknown): value is string {
	return isNonEmptyString(value) && SAFE_NAMESPACE_PATTERN.test(value);
}

export function toSafeNamespace(value: string): string {
	const replaced = value.replace(UNSAFE_NAMESPACE_RUN_PATTERN, '-');
	const trimmed = replaced.replace(LEADING_NAMESPACE_HYPHENS_PATTERN, '').replace(TRAILING_NAMESPACE_HYPHENS_PATTERN, '');
	return isSafeNamespace(trimmed) ? trimmed : DEFAULT_NAMESPACE;
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

function readRequiredCommand(value: unknown, fieldName: string): string[] {
	if (!Array.isArray(value) || value.length === 0 || value.some(part => !isNonEmptyString(part))) {
		throw new Error(`${fieldName} must be a non-empty string array`);
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

function readPort(value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
		throw new Error('port must be an integer between 1 and 65535');
	}
	return value;
}

export function validateToolConfig(raw: unknown): ToolConfig {
	const config = (raw ?? {}) as Partial<ToolConfig>;
	const command = readRequiredCommand(config.command, 'command');
	if (!isSafeNamespace(config.namespace)) {
		throw new Error(`namespace must match ${SAFE_NAMESPACE_DESCRIPTION}`);
	}

	return {
		namespace: config.namespace,
		command,
		setupCommand: readOptionalCommand(config.setupCommand, 'setupCommand'),
		port: readPort(config.port),
		requiredFiles: readStringList(config.requiredFiles, 'requiredFiles'),
		orphanMatchers: readStringList(config.orphanMatchers, 'orphanMatchers'),
	};
}

export function createDefaultToolConfig(options: DefaultToolConfigOptions): ToolConfig {
	return validateToolConfig({
		namespace: toSafeNamespace(options.namespaceSeed),
		command: [options.packageManager, 'run', options.script],
		setupCommand: [options.packageManager, 'install'],
		port: 3000,
		requiredFiles: ['package.json'],
		orphanMatchers: [],
	});
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
	return validateToolConfig(parseJsonc(await readFirstConfig(repoRoot)));
}

export function renderConfigJsonc(config: ToolConfig): string {
	const setupCommandSection = config.setupCommand === undefined ? '' : `
  // Optional command run manually with the setup key in the selected worktree.
  // Useful for first-time dependency installation without doing it on every switch.
  "setupCommand": ${JSON.stringify(config.setupCommand)},
`;
	return `{
  // Session namespace used for git-common-dir state files and logs.
  // Keep this filesystem-safe: letters, numbers, dots, underscores, and hyphens only.
  "namespace": ${JSON.stringify(config.namespace)},

  // Command launched in the selected worktree.
  // Use argv form so spaces and shell metacharacters are passed safely.
  "command": ${JSON.stringify(config.command)},
${setupCommandSection}
  // TCP port owned by the command, used when stopping stale/orphaned processes.
  "port": ${JSON.stringify(config.port)},

  // Files that must exist in a worktree before the command can be started there.
  "requiredFiles": ${JSON.stringify(config.requiredFiles)},

  // Extra process command-line substrings treated as orphans for cleanup.
  // Example: ["node --watch", "vite --host 0.0.0.0"]
  "orphanMatchers": ${JSON.stringify(config.orphanMatchers)},
}
`;
}

export async function findExistingConfigPath(workspaceRoot: string, fileExists: (filePath: string) => Promise<boolean>): Promise<string | null> {
	for (const fileName of CONFIG_FILE_NAMES) {
		const configPath = path.join(workspaceRoot, fileName);
		if (await fileExists(configPath)) {
			return configPath;
		}
	}
	return null;
}

export async function writeToolConfigForRepo({workspaceRoot, force, config}: ConfigInitOptions, fileExists: (filePath: string) => Promise<boolean>): Promise<ConfigInitResult> {
	const configPath = path.join(workspaceRoot, CONFIG_FILE_NAME);
	const existingConfigPath = await findExistingConfigPath(workspaceRoot, fileExists);
	if (!force && existingConfigPath) {
		throw new Error(`Config file already exists: ${existingConfigPath}`);
	}

	const validatedConfig = validateToolConfig(config);
	await writeFile(configPath, renderConfigJsonc(validatedConfig), 'utf8');
	return {path: configPath, config: validatedConfig};
}
