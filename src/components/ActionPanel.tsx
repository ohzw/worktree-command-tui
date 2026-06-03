import React from 'react';
import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

function formatTags(tags: AppRow['tags']): string {
	return tags.length === 0 ? '-' : tags.join(' · ');
}

function getActionMessage(selectedRow: AppRow, activePath: string | null): string {
	if (selectedRow.invalidReason) {
		return 'Cannot start this worktree.';
	}
	if (selectedRow.path === activePath) {
		return 'Already active. Press s to stop the current session.';
	}
	return 'Press Enter to start here and switch the active session.';
}

function getNotes(selectedRow: AppRow): string {
	if (selectedRow.invalidReason) {
		return selectedRow.invalidReason;
	}
	if (selectedRow.tags.includes('external')) {
		return 'External worktree managed outside the main checkout path.';
	}
	if (selectedRow.tags.includes('active')) {
		return 'This worktree currently owns the running command session.';
	}
	return 'Ready to launch with the configured command in this worktree.';
}

export function ActionPanel({
	selectedRow,
	activePath,
	stacked,
	width,
}: {
	selectedRow: AppRow | undefined;
	activePath: string | null;
	stacked: boolean;
	width?: number;
}) {
	if (!selectedRow) {
		return (
			<Box width={width} flexGrow={stacked ? 0 : 1} flexShrink={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
				<Text bold color="magenta">
					Selection / Action
				</Text>
				<Text dimColor>No worktrees found.</Text>
			</Box>
		);
	}

	return (
		<Box width={width} flexGrow={stacked ? 0 : 1} flexShrink={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
			<Text bold color="magenta">
				Selection / Action
			</Text>
			<Text bold color={selectedRow.tags.includes('active') ? 'green' : undefined} wrap="truncate-end">
				Branch: {selectedRow.branch}
			</Text>
			<Text wrap="truncate-end">Path: {selectedRow.path}</Text>
			<Text wrap="truncate-end">Tags: {formatTags(selectedRow.tags)}</Text>
			<Text wrap="truncate-end">Action: {getActionMessage(selectedRow, activePath)}</Text>
			<Text wrap="truncate-end">Notes: {getNotes(selectedRow)}</Text>
		</Box>
	);
}
