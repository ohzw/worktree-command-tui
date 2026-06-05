import {describe, expect, it} from 'vitest';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CONFIG_FILE_NAME, LEGACY_CONFIG_FILE_NAME, loadToolConfig} from './config.js';

describe('loadToolConfig', () => {
	it('loads .worktree-command-tui.jsonc with comments and preserves argv command', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-'));
		writeFileSync(
			path.join(root, CONFIG_FILE_NAME),
			`{
				// Process/session namespace.
				"namespace": "rojo-serve",
				"command": ["npm", "run", "serve"],
				"setupCommand": ["npm", "install"],
				"port": 34872,
				"requiredFiles": ["package.json", "default.project.json"],
				"orphanMatchers": ["rbxtsc -w"],
			}`,
		);

		const config = await loadToolConfig({repoRoot: root});
		expect(config.namespace).toBe('rojo-serve');
		expect(config.command).toEqual(['npm', 'run', 'serve']);
		expect(config.setupCommand).toEqual(['npm', 'install']);
		expect(config.port).toBe(34872);
	});

	it('keeps loading legacy .worktree-command-tui.json configs', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-legacy-'));
		writeFileSync(
			path.join(root, LEGACY_CONFIG_FILE_NAME),
			JSON.stringify({
				namespace: 'legacy-serve',
				command: ['npm', 'run', 'serve'],
				port: 34872,
			}),
		);

		const config = await loadToolConfig({repoRoot: root});
		expect(config.namespace).toBe('legacy-serve');
		expect(config.command).toEqual(['npm', 'run', 'serve']);
	});

	it('throws a readable error when command is not a non-empty argv array', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-bad-'));
		writeFileSync(
			path.join(root, CONFIG_FILE_NAME),
			JSON.stringify({namespace: 'rojo-serve', command: 'npm run serve'}),
		);

		await expect(loadToolConfig({repoRoot: root})).rejects.toThrow('command must be a non-empty string array');
	});

	it('throws a readable error when setupCommand is not a non-empty argv array', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-bad-setup-'));
		writeFileSync(
			path.join(root, CONFIG_FILE_NAME),
			JSON.stringify({namespace: 'rojo-serve', command: ['npm', 'run', 'serve'], setupCommand: [], port: 34872}),
		);

		await expect(loadToolConfig({repoRoot: root})).rejects.toThrow('setupCommand must be a non-empty string array when set');
	});

	it('rejects namespace values that escape the namespace slot', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-namespace-'));
		writeFileSync(
			path.join(root, CONFIG_FILE_NAME),
			JSON.stringify({namespace: '../rojo-serve', command: ['npm', 'run', 'serve'], port: 34872}),
		);

		await expect(loadToolConfig({repoRoot: root})).rejects.toThrow('namespace must match [A-Za-z0-9._-]+');
	});

	it('rejects ports outside the tcp range', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'wctui-config-port-'));
		writeFileSync(
			path.join(root, CONFIG_FILE_NAME),
			JSON.stringify({namespace: 'rojo-serve', command: ['npm', 'run', 'serve'], port: 70000}),
		);

		await expect(loadToolConfig({repoRoot: root})).rejects.toThrow('port must be an integer between 1 and 65535');
	});
});
