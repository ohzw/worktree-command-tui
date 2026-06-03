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

export function ActionPanel({selectedRow, activePath}: {selectedRow: AppRow | undefined; activePath: string | null}) {
	if (!selectedRow) {
		return (
			<Box flexGrow={1} borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold>Selection / Action</Text>
				<Text dimColor>No worktrees found.</Text>
			</Box>
		);
	}

	return (
		<Box flexGrow={1} borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold>Selection / Action</Text>
			<Text bold wrap="truncate-end">
				Branch: {selectedRow.branch}
			</Text>
			<Text wrap="truncate-end">Path: {selectedRow.path}</Text>
			<Text wrap="truncate-end">Tags: {formatTags(selectedRow.tags)}</Text>
			<Text wrap="truncate-end">Action: {getActionMessage(selectedRow, activePath)}</Text>
			<Text wrap="truncate-end">Notes: {getNotes(selectedRow)}</Text>
		</Box>
	);
}
