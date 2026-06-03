import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export async function isProcessGroupAlive(pgid: number): Promise<boolean> {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function killProcessGroup(pgid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
	try {
		process.kill(-pgid, signal);
	} catch {
		// Process group already gone.
	}
}

export async function killPortOwner(port: number): Promise<void> {
	try {
		const {stdout} = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
		for (const pid of stdout
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)) {
			await execFileAsync('kill', [pid]);
		}
	} catch {
		// Port not owned or lsof found nothing.
	}
}

export async function killOrphans(matcher: string): Promise<void> {
	try {
		await execFileAsync('pkill', ['-f', matcher]);
	} catch {
		// No matching orphan process.
	}
}
