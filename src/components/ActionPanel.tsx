import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

function formatTags(tags: AppRow['tags']): string {
	return tags.length === 0 ? '-' : tags.join(' · ');
}

function sanitizeInlineText(value: string): string {
	return value
		.replace(/[\r\n\t\u2028\u2029]+/g, ' ')
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
		.replace(/\p{Cf}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function formatUpstream(selectedRow: AppRow): string {
	if (selectedRow.upstreamUnavailable) {
		return 'unavailable';
	}
	if (!selectedRow.upstream) {
		return '-';
	}
	return `${sanitizeInlineText(selectedRow.upstream.branch)} (↑${selectedRow.upstream.ahead} ↓${selectedRow.upstream.behind})`;
}

function formatWorkingTree(selectedRow: AppRow): string {
	if (!selectedRow.workingTree) {
		return 'unavailable';
	}
	const {staged, unstaged, untracked, conflicts} = selectedRow.workingTree;
	if (staged === 0 && unstaged === 0 && untracked === 0 && conflicts === 0) {
		return 'clean';
	}
	const parts: string[] = [];
	if (staged > 0) {
		parts.push(`index ${staged}`);
	}
	if (unstaged > 0) {
		parts.push(`worktree ${unstaged}`);
	}
	if (untracked > 0) {
		parts.push(`untracked ${untracked}`);
	}
	if (conflicts > 0) {
		parts.push(`conflicts ${conflicts}`);
	}
	return `dirty (${parts.join(' · ')})`;
}

function formatPullRequest(selectedRow: AppRow): string {
	if (!selectedRow.pullRequest || selectedRow.pullRequest.kind === 'none') {
		return 'none';
	}
	if (selectedRow.pullRequest.kind === 'unavailable') {
		return 'unavailable';
	}
	const draft = selectedRow.pullRequest.isDraft ? 'draft/' : '';
	return `#${selectedRow.pullRequest.number} ${draft}${selectedRow.pullRequest.state.toLowerCase()} → ${sanitizeInlineText(selectedRow.pullRequest.baseBranch)}`;
}

function getPullRequestLabel(selectedRow: AppRow): string {
	if (selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN') {
		return 'Last PR';
	}
	return 'PR';
}

function getPullRequestTitleLabel(selectedRow: AppRow): string {
	if (selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN') {
		return 'Last PR Title';
	}
	return 'PR Title';
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
				Branch: {sanitizeInlineText(selectedRow.branch)}
			</Text>
			<Text wrap="truncate-end">Path: {sanitizeInlineText(selectedRow.shortPath)}</Text>
			{selectedRow.shortPath !== selectedRow.path ? <Text wrap="truncate-end">Full Path: {sanitizeInlineText(selectedRow.path)}</Text> : undefined}
			<Text wrap="truncate-end">HEAD: {selectedRow.headSha || '-'}</Text>
			<Text wrap="truncate-end">Upstream: {formatUpstream(selectedRow)}</Text>
			<Text wrap="truncate-end">Status: {formatWorkingTree(selectedRow)}</Text>
			<Text wrap="truncate-end">{getPullRequestLabel(selectedRow)}: {formatPullRequest(selectedRow)}</Text>
			{selectedRow.pullRequest?.kind === 'found' ? <Text wrap="truncate-end">{getPullRequestTitleLabel(selectedRow)}: {sanitizeInlineText(selectedRow.pullRequest.title)}</Text> : undefined}
			<Text wrap="truncate-end">Tags: {formatTags(selectedRow.tags)}</Text>
			<Text wrap="truncate-end">Action: {getActionMessage(selectedRow, activePath)}</Text>
			<Text wrap="truncate-end">Notes: {getNotes(selectedRow)}</Text>
		</Box>
	);
}
