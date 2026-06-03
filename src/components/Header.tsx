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
		<Box borderStyle="round" flexDirection="column" paddingX={1} marginBottom={1}>
			<Text bold wrap="truncate-end">
				Worktree Command TUI · Repo: {repoName}
			</Text>
			<Text wrap="truncate-end">
				Active: {activeBranch ?? '-'} · Namespace: {namespace}
			</Text>
		</Box>
	);
}
