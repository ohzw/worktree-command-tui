import React from 'react';
import {Box, Text} from 'ink';
import {sanitizeInlineText} from '../core/worktree-projection.js';

export function Header({
	repoName,
	namespace,
	activeBranch,
}: {
	repoName: string;
	namespace: string;
	activeBranch: string | null;
}) {
	const safeRepoName = sanitizeInlineText(repoName);
	const safeNamespace = sanitizeInlineText(namespace);
	const safeActiveBranch = activeBranch === null ? '-' : sanitizeInlineText(activeBranch);

	return (
		<Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1}>
			<Text bold color="blue" wrap="truncate-end">
				Worktree Command TUI · Repo: {safeRepoName}
			</Text>
			<Text color="green" wrap="truncate-end">
				Active: {safeActiveBranch}
			</Text>
			<Text dimColor wrap="truncate-end">
				Namespace: {safeNamespace}
			</Text>
		</Box>
	);
}
