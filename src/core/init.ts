import {access, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {ToolConfig} from './config.js';
import {createDefaultToolConfig, renderConfigJsonc, writeToolConfigForRepo} from './config-lifecycle.js';

const execFileAsync = promisify(execFile);
export {renderConfigJsonc};

interface ProjectPackageJson {
	name?: string;
	packageManager?: string;
	scripts?: Record<string, string>;
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
	return createDefaultToolConfig({
		namespaceSeed: packageJson?.name ?? path.basename(repoRoot),
		packageManager,
		script: selectDefaultScript(packageJson?.scripts),
	});
}


export interface InitResult {
	path: string;
	config: ToolConfig;
}

export interface InitOptions {
	workspaceRoot: string;
	force: boolean;
}


export async function runInit(options: InitOptions): Promise<InitResult> {
	const config = await buildDefaultConfig(options.workspaceRoot);
	return writeToolConfigForRepo({...options, config}, fileExists);
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
