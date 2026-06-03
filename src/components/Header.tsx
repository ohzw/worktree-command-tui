import React from 'react';
import {Box, Text} from 'ink';

export function Header({
	repoName,
	namespace,
	activeBranch,
	activePath,
}: {
	repoName: string;
	namespace: string;
	activeBranch: string | null;
	activePath: string | null;
}) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text>worktree-command-tui</Text>
			<Text>repo: {repoName}</Text>
			<Text>namespace: {namespace}</Text>
			<Text>active: {activeBranch ?? '-'} {activePath ?? ''}</Text>
		</Box>
	);
}
