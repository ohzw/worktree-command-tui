import {access} from 'node:fs/promises';
import path from 'node:path';

export async function getInvalidReason(worktreePath: string, requiredFiles: string[]): Promise<string | null> {
	const missing = new Set<string>();

	for (const relativePath of requiredFiles) {
		try {
			await access(path.join(worktreePath, relativePath));
		} catch {
			missing.add(relativePath);
		}
	}

	return missing.size === 0 ? null : `Missing required files: ${[...missing].join(', ')}`;
}
