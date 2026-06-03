import {expect, it} from 'vitest';
import {stopSessionWithFallback} from './process-control.js';

it('kills recorded process group before fallback cleanup', async () => {
	const calls: string[] = [];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, port: 34872, orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async port => {
				calls.push(`port:${port}`);
			},
			killOrphans: async matcher => {
				calls.push(`orphans:${matcher}`);
			},
			isSessionAlive: async () => false,
		},
	);
	expect(stopped).toBe(true);
	expect(calls).toEqual(['pg:777:SIGTERM']);
});

it('runs fallback cleanup and escalates when session still appears alive after pg kill', async () => {
	const calls: string[] = [];
	const aliveStates = [true, true, false];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, port: 34872, orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async port => {
				calls.push(`port:${port}`);
			},
			killOrphans: async matcher => {
				calls.push(`orphans:${matcher}`);
			},
			isSessionAlive: async () => aliveStates.shift() ?? false,
		},
	);
	expect(stopped).toBe(true);
	expect(calls).toEqual(['pg:777:SIGTERM', 'port:34872', 'orphans:rbxtsc -w', 'pg:777:SIGKILL']);
});

it('reports failure when cleanup still cannot stop the session', async () => {
	const calls: string[] = [];
	const stopped = await stopSessionWithFallback(
		{pgid: 777, port: 34872, orphanMatchers: ['rbxtsc -w']},
		{
			killProcessGroup: async (pgid, signal = 'SIGTERM') => {
				calls.push(`pg:${pgid}:${signal}`);
			},
			killPortOwner: async port => {
				calls.push(`port:${port}`);
			},
			killOrphans: async matcher => {
				calls.push(`orphans:${matcher}`);
			},
			isSessionAlive: async () => true,
		},
	);
	expect(stopped).toBe(false);
	expect(calls).toEqual(['pg:777:SIGTERM', 'port:34872', 'orphans:rbxtsc -w', 'pg:777:SIGKILL']);
});
