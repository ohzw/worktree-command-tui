export interface CleanupDeps {
	killProcessGroup: (pgid: number, signal?: NodeJS.Signals) => Promise<void>;
	killPortOwner: (port: number, pgid: number) => Promise<void>;
	killOrphans: (matcher: string, pgid: number) => Promise<void>;
	isSessionAlive: (pgid: number) => Promise<boolean>;
}

export async function stopSessionWithFallback(
	input: {pgid: number; ports: number[]; orphanMatchers: string[]},
	deps: CleanupDeps,
): Promise<boolean> {
	if (input.pgid <= 1) {
		return false;
	}
	await deps.killProcessGroup(input.pgid, 'SIGTERM');
	if (!(await deps.isSessionAlive(input.pgid))) {
		return true;
	}

	for (const port of input.ports) {
		await deps.killPortOwner(port, input.pgid);
	}
	for (const matcher of input.orphanMatchers) {
		await deps.killOrphans(matcher, input.pgid);
	}
	if (!(await deps.isSessionAlive(input.pgid))) {
		return true;
	}

	await deps.killProcessGroup(input.pgid, 'SIGKILL');
	return !(await deps.isSessionAlive(input.pgid));
}
