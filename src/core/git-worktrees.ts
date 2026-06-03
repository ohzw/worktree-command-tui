import {execFile} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export interface WorktreeRow {
	path: string;
	branch: string;
	headSha: string;
	isMain: boolean;
	isExternal: boolean;
}

function isExternalWorktree(mainWorktreePath: string, worktreePath: string): boolean {
	const relativePath = path.relative(mainWorktreePath, worktreePath);
	return relativePath !== '' && (relativePath === '..' || relativePath.startsWith(`..${path.sep}`));
}

export function parseWorktreeListPorcelain(input: string, mainWorktreePath: string): WorktreeRow[] {
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return [];
	}

	return trimmed
		.split(/\n\s*\n/)
		.filter(Boolean)
		.map(block => {
			const lines = block.split('\n');
			const pathLine = lines.find(line => line.startsWith('worktree '));
			const headLine = lines.find(line => line.startsWith('HEAD '));
			const branchLine = lines.find(line => line.startsWith('branch '));
			const detached = lines.includes('detached');
			const worktreePath = pathLine?.slice('worktree '.length) ?? '';
			const fullRef = branchLine?.slice('branch '.length) ?? '';

			return {
				path: worktreePath,
				branch: branchLine ? fullRef.replace('refs/heads/', '') : detached ? '(detached)' : '(unknown)',
				headSha: headLine?.slice('HEAD '.length) ?? '',
				isMain: worktreePath === mainWorktreePath,
				isExternal: isExternalWorktree(mainWorktreePath, worktreePath),
			};
		});
}

export function sortWorktrees(rows: WorktreeRow[], activePath: string | null): WorktreeRow[] {
	return [...rows].sort((left, right) => {
		if (left.isMain !== right.isMain) {
			return left.isMain ? -1 : 1;
		}

		const leftActive = activePath !== null && left.path === activePath;
		const rightActive = activePath !== null && right.path === activePath;
		if (leftActive !== rightActive) {
			return leftActive ? -1 : 1;
		}

		const branchCompare = left.branch.localeCompare(right.branch);
		return branchCompare !== 0 ? branchCompare : left.path.localeCompare(right.path);
	});
}

export async function readWorktrees(cwd: string, mainWorktreePath: string): Promise<WorktreeRow[]> {
	const {stdout} = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {cwd});
	return parseWorktreeListPorcelain(stdout, mainWorktreePath);
}

export function toShortPath(mainWorktreePath: string, worktreePath: string): string {
	if (worktreePath === mainWorktreePath) {
		return '.';
	}
	if (worktreePath.startsWith(`${mainWorktreePath}${path.sep}`)) {
		return path.relative(mainWorktreePath, worktreePath);
	}
	return worktreePath;
}
