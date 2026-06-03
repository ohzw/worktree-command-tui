import {access, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CONFIG_FILE_NAME, CONFIG_FILE_NAMES, type ToolConfig} from './config.js';

const execFileAsync = promisify(execFile);

interface ProjectPackageJson {
	name?: string;
	packageManager?: string;
	scripts?: Record<string, string>;
}

function isSafeNamespace(value: string): boolean {
	return /^[A-Za-z0-9._-]+$/u.test(value);
}

function toSafeNamespace(value: string): string {
	const replaced = value.replace(/[^A-Za-z0-9._-]+/gu, '-');
	const trimmed = replaced.replace(/^-+/, '').replace(/-+$/, '');
	return trimmed.length > 0 && isSafeNamespace(trimmed) ? trimmed : 'worktree-command-tui';
}

async function resolveRepositoryRoot(cwd: string): Promise<string> {
	const {stdout} = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {cwd});
	return stdout.trim();
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function readPackageJson(root: string): Promise<ProjectPackageJson | null> {
	try {
		const source = await readFile(path.join(root, 'package.json'), 'utf8');
		return JSON.parse(source) as ProjectPackageJson;
	} catch {
		return null;
	}
}

function getPackageManagerFromField(packageManagerValue: string | undefined): 'bun' | 'pnpm' | 'yarn' | 'npm' | null {
	if (!packageManagerValue) {
		return null;
	}
	if (packageManagerValue.startsWith('bun@')) {
		return 'bun';
	}
	if (packageManagerValue.startsWith('pnpm@')) {
		return 'pnpm';
	}
	if (packageManagerValue.startsWith('yarn@')) {
		return 'yarn';
	}
	if (packageManagerValue.startsWith('npm@')) {
		return 'npm';
	}
	return null;
}

async function detectPackageManager(root: string, packageJson: ProjectPackageJson | null): Promise<'bun' | 'pnpm' | 'yarn' | 'npm'> {
	const declared = getPackageManagerFromField(packageJson?.packageManager);
	if (declared) {
		return declared;
	}

	if (await fileExists(path.join(root, 'bun.lockb')) || await fileExists(path.join(root, 'bun.lock'))) {
		return 'bun';
	}
	if (await fileExists(path.join(root, 'pnpm-lock.yaml'))) {
		return 'pnpm';
	}
	if (await fileExists(path.join(root, 'yarn.lock'))) {
		return 'yarn';
	}
	return 'npm';
}
function selectDefaultScript(scripts: Record<string, string> | undefined): string {
	if (typeof scripts?.dev === 'string' && scripts.dev.length > 0) {
		return 'dev';
	}
	if (typeof scripts?.start === 'string' && scripts.start.length > 0) {
		return 'start';
	}
	if (typeof scripts?.serve === 'string' && scripts.serve.length > 0) {
		return 'serve';
	}

	const fallback = Object.entries(scripts ?? {}).find(
		([, script]) => typeof script === 'string' && script.length > 0,
	)?.[0];

	return fallback ?? 'start';
}

export async function buildDefaultConfig(repoRoot: string): Promise<ToolConfig> {
	const packageJson = await readPackageJson(repoRoot);
	const packageManager = await detectPackageManager(repoRoot, packageJson);
	const command = [packageManager, 'run', selectDefaultScript(packageJson?.scripts)];
	const namespaceSeed = packageJson?.name ?? path.basename(repoRoot);
	return {
		namespace: toSafeNamespace(namespaceSeed),
		command,
		port: 3000,
		requiredFiles: ['package.json'],
		orphanMatchers: [],
	};

}

export function renderConfigJsonc(config: ToolConfig): string {
	return `{
  // Session namespace used for git-common-dir state files and logs.
  // Keep this filesystem-safe: letters, numbers, dots, underscores, and hyphens only.
  "namespace": ${JSON.stringify(config.namespace)},

  // Command launched in the selected worktree.
  // Use argv form so spaces and shell metacharacters are passed safely.
  "command": ${JSON.stringify(config.command)},

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

export interface InitResult {
	path: string;
	config: ToolConfig;
}

export interface InitOptions {
	workspaceRoot: string;
	force: boolean;
}

async function findExistingConfigPath(workspaceRoot: string): Promise<string | null> {
	for (const fileName of CONFIG_FILE_NAMES) {
		const configPath = path.join(workspaceRoot, fileName);
		if (await fileExists(configPath)) {
			return configPath;
		}
	}
	return null;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
	const configPath = path.join(options.workspaceRoot, CONFIG_FILE_NAME);
	const existingConfigPath = await findExistingConfigPath(options.workspaceRoot);
	if (!options.force && existingConfigPath) {
		throw new Error(`Config file already exists: ${existingConfigPath}`);
	}

	const config = await buildDefaultConfig(options.workspaceRoot);
	await writeFile(configPath, renderConfigJsonc(config), 'utf8');
	return {path: configPath, config};
}

export interface CliInitOptions {
	cwd: string;
	force: boolean;
}

export async function createConfigForRepo(options: CliInitOptions): Promise<InitResult> {
	const workspaceRoot = await resolveRepositoryRoot(options.cwd);
	return runInit({workspaceRoot, force: options.force});
}

export interface InitArgParseResult {
	force: boolean;
	help: boolean;
}

export function parseInitArgs(args: string[]): InitArgParseResult {
	const result: InitArgParseResult = {force: false, help: false};
	for (const arg of args) {
		if (arg === '--force') {
			result.force = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			result.help = true;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return result;
}
