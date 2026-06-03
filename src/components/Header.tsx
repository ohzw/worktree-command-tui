import React from 'react';
import {Box, Text} from 'ink';

export function Header({
	repoName,
	namespace,
	activeBranch,
}: {
	repoName: string;
	namespace: string;
	activeBranch: string | null;
}) {
	return (
		<Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1}>
			<Text bold color="blue" wrap="truncate-end">
				Worktree Command TUI · Repo: {repoName}
			</Text>
			<Text color="green" wrap="truncate-end">
				Active: {activeBranch ?? '-'}
			</Text>
			<Text dimColor wrap="truncate-end">
				Namespace: {namespace}
			</Text>
		</Box>
	);
}
