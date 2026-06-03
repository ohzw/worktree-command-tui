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
		<Box flexDirection="column" marginBottom={1}>
			<Text wrap="truncate-end">worktree-command-tui · {repoName} · {namespace}</Text>
			<Text color={activeBranch ? 'green' : undefined} wrap="truncate-end">
				active: {activeBranch ?? '-'}
			</Text>
		</Box>
	);
}
