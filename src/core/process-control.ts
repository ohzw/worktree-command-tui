export interface CleanupDeps {
	killProcessGroup: (pgid: number, signal?: NodeJS.Signals) => Promise<void>;
	killPortOwner: (port: number) => Promise<void>;
	killOrphans: (matcher: string) => Promise<void>;
	isSessionAlive: (pgid: number) => Promise<boolean>;
}

export async function stopSessionWithFallback(
	input: {pgid: number; port: number; orphanMatchers: string[]},
	deps: CleanupDeps,
): Promise<boolean> {
	await deps.killProcessGroup(input.pgid, 'SIGTERM');
	if (!(await deps.isSessionAlive(input.pgid))) {
		return true;
	}

	await deps.killPortOwner(input.port);
	for (const matcher of input.orphanMatchers) {
		await deps.killOrphans(matcher);
	}
	if (!(await deps.isSessionAlive(input.pgid))) {
		return true;
	}

	await deps.killProcessGroup(input.pgid, 'SIGKILL');
	return !(await deps.isSessionAlive(input.pgid));
}
