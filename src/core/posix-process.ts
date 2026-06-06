import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
async function readProcessGroupId(pid: string): Promise<number | null> {
	try {
		const {stdout} = await execFileAsync('ps', ['-o', 'pgid=', '-p', pid]);
		const pgid = Number(stdout.trim());
		return Number.isInteger(pgid) ? pgid : null;
	} catch {
		return null;
	}
}


export async function isProcessGroupAlive(pgid: number): Promise<boolean> {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function killProcessGroup(pgid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
	if (pgid <= 1) {
		return;
	}
	try {
		process.kill(-pgid, signal);
	} catch {
		// Process group already gone.
	}
}

export async function killPortOwner(port: number, pgid: number): Promise<void> {
	try {
		const {stdout} = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
		for (const pid of stdout
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)) {
			if (await readProcessGroupId(pid) === pgid) {
				await execFileAsync('kill', [pid]);
			}
		}
	} catch {
		// Port not owned or lsof found nothing.
	}
}

export async function killOrphans(matcher: string, pgid: number): Promise<void> {
	try {
		await execFileAsync('pkill', ['-g', String(pgid), '-f', matcher]);
	} catch {
		// No matching orphan process.
	}
}
