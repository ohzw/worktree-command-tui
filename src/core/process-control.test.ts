import {expect, it} from 'vitest';
import {stopSessionWithFallback} from './process-control.js';

it('refuses unsafe process groups without signaling anything', async () => {
	const calls: string[] = [];
	const stopped = await stopSessionWithFallback(
		{pgid: 1, ports: [34872, 4000], orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async (port, pgid) => {
				calls.push(`port:${port}:${pgid}`);
			},
			killOrphans: async (matcher, pgid) => {
				calls.push(`orphans:${matcher}:${pgid}`);
			},
			isSessionAlive: async () => true,
		},
	);

	expect(stopped).toBe(false);
	expect(calls).toEqual([]);
});

it('kills recorded process group before fallback cleanup', async () => {
	const calls: string[] = [];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, ports: [34872], orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async (port, pgid) => {
				calls.push(`port:${port}:${pgid}`);
			},
			killOrphans: async (matcher, pgid) => {
				calls.push(`orphans:${matcher}:${pgid}`);
			},
			isSessionAlive: async () => false,
		},
	);

	expect(stopped).toBe(true);
	expect(calls).toEqual(['pg:777:SIGTERM']);
});

it('runs fallback cleanup across all configured ports and escalates when session still appears alive after pg kill', async () => {
	const calls: string[] = [];
	const aliveStates = [true, true, false];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, ports: [34872, 4000], orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async (port, pgid) => {
				calls.push(`port:${port}:${pgid}`);
			},
			killOrphans: async (matcher, pgid) => {
				calls.push(`orphans:${matcher}:${pgid}`);
			},
			isSessionAlive: async () => aliveStates.shift() ?? false,
		},
	);

	expect(stopped).toBe(true);
	expect(calls).toEqual([
		'pg:777:SIGTERM',
		'port:34872:777',
		'port:4000:777',
		'orphans:rbxtsc -w:777',
		'pg:777:SIGKILL',
	]);
});

it('reports failure when cleanup still cannot stop the session', async () => {
	const calls: string[] = [];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, ports: [34872, 4000], orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async (port, pgid) => {
				calls.push(`port:${port}:${pgid}`);
			},
			killOrphans: async (matcher, pgid) => {
				calls.push(`orphans:${matcher}:${pgid}`);
			},
			isSessionAlive: async () => true,
		},
	);

	expect(stopped).toBe(false);
	expect(calls).toEqual([
		'pg:777:SIGTERM',
		'port:34872:777',
		'port:4000:777',
		'orphans:rbxtsc -w:777',
		'pg:777:SIGKILL',
	]);
});
