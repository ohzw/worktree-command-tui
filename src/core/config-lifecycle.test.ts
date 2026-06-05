import {describe, expect, it} from 'vitest';
import {createDefaultToolConfig, toSafeNamespace, validateToolConfig} from './config-lifecycle.js';

const validConfig = {
	namespace: 'example-app',
	command: ['npm', 'run', 'dev'],
	setupCommand: ['npm', 'install'],
	port: 3000,
	requiredFiles: ['package.json'],
	orphanMatchers: [],
};

describe('validateToolConfig', () => {
	it('normalizes missing optional lists to the same defaults used by init', () => {
		expect(validateToolConfig({namespace: 'example-app', command: ['npm', 'run', 'dev'], port: 3000})).toEqual({
			namespace: 'example-app',
			command: ['npm', 'run', 'dev'],
			setupCommand: undefined,
			port: 3000,
			requiredFiles: [],
			orphanMatchers: [],
		});
	});

	it('accepts generated default configs without changing public fields', () => {
		const config = createDefaultToolConfig({
			namespaceSeed: 'example app',
			packageManager: 'npm',
			script: 'start',
		});

		expect(validateToolConfig(config)).toEqual({
			namespace: 'example-app',
			command: ['npm', 'run', 'start'],
			setupCommand: ['npm', 'install'],
			port: 3000,
			requiredFiles: ['package.json'],
			orphanMatchers: [],
		});
	});

	it('rejects invalid namespaces with the public load error', () => {
		expect(() => validateToolConfig({...validConfig, namespace: '../example-app'})).toThrow(
			'namespace must match [A-Za-z0-9._-]+',
		);
	});

	it('rejects command values that are not non-empty argv arrays', () => {
		expect(() => validateToolConfig({...validConfig, command: 'npm run dev'})).toThrow(
			'command must be a non-empty string array',
		);
		expect(() => validateToolConfig({...validConfig, command: []})).toThrow(
			'command must be a non-empty string array',
		);
	});

	it('rejects malformed optional list fields with public load errors', () => {
		expect(() => validateToolConfig({...validConfig, requiredFiles: ['package.json', '']})).toThrow(
			'requiredFiles must be a string array',
		);
		expect(() => validateToolConfig({...validConfig, orphanMatchers: 'vite'})).toThrow(
			'orphanMatchers must be a string array',
		);
	});

	it('rejects ports outside the tcp range', () => {
		expect(() => validateToolConfig({...validConfig, port: 0})).toThrow(
			'port must be an integer between 1 and 65535',
		);
		expect(() => validateToolConfig({...validConfig, port: 65_536})).toThrow(
			'port must be an integer between 1 and 65535',
		);
	});
});

describe('toSafeNamespace', () => {
	it('replaces unsafe runs and falls back when no safe namespace remains', () => {
		expect(toSafeNamespace('@scope/example app')).toBe('scope-example-app');
		expect(toSafeNamespace('///')).toBe('worktree-command-tui');
	});
});
