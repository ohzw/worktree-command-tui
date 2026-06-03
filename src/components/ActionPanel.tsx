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

export function getPullRequestColor(selectedRow: AppRow): 'green' | 'yellow' | 'red' | undefined {
	if (!selectedRow.pullRequest || selectedRow.pullRequest.kind === 'none') {
		return undefined;
	}
	if (selectedRow.pullRequest.kind === 'unavailable') {
		return 'red';
	}
	if (selectedRow.pullRequest.state !== 'OPEN') {
		return undefined;
	}
	return selectedRow.pullRequest.isDraft ? 'yellow' : 'green';
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

export function getActionColor(selectedRow: AppRow): 'yellow' | 'red' | undefined {
	if (selectedRow.invalidReason) {
		return 'red';
	}
	if ((selectedRow.workingTree?.conflicts ?? 0) > 0) {
		return 'red';
	}
	if (
		(selectedRow.workingTree?.staged ?? 0) > 0
		|| (selectedRow.workingTree?.unstaged ?? 0) > 0
		|| (selectedRow.workingTree?.untracked ?? 0) > 0
	) {
		return 'yellow';
	}
	return undefined;
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

function SectionHeader({label}: {label: string}) {
	return (
		<Text bold color="cyan">
			[{label}]
		</Text>
	);
}

export function ActionPanel({
	selectedRow,
	activePath,
	stacked,
	width,
	compactDetails,
}: {
	selectedRow: AppRow | undefined;
	activePath: string | null;
	stacked: boolean;
	width?: number;
	compactDetails?: boolean;
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

	const actionMessage = getActionMessage(selectedRow, activePath);
	const showFullPath = !compactDetails && selectedRow.shortPath !== selectedRow.path;
	const showTags = !compactDetails;
	const pullRequestTitle = selectedRow.pullRequest?.kind === 'found' && !compactDetails
		? sanitizeInlineText(selectedRow.pullRequest.title)
		: null;

	return (
		<Box width={width} flexGrow={stacked ? 0 : 1} flexShrink={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
			<Text bold color="magenta">
				Selection / Action
			</Text>
			<SectionHeader label="Identity" />
			<Text bold color={selectedRow.tags.includes('active') ? 'green' : undefined} wrap="truncate-end">
				Branch: {sanitizeInlineText(selectedRow.branch)}
			</Text>
			<Text wrap="truncate-end">Path: {sanitizeInlineText(selectedRow.shortPath)}</Text>
			{showFullPath ? <Text wrap="truncate-end">Full Path: {sanitizeInlineText(selectedRow.path)}</Text> : undefined}
			<Text wrap="truncate-end">HEAD: {selectedRow.headSha || '-'}</Text>
			{showTags ? <Text wrap="truncate-end">Tags: {formatTags(selectedRow.tags)}</Text> : undefined}
			<SectionHeader label="Git / PR" />
			<Text wrap="truncate-end">Upstream: {formatUpstream(selectedRow)}</Text>
			<Text wrap="truncate-end">Status: {formatWorkingTree(selectedRow)}</Text>
			<Text color={getPullRequestColor(selectedRow)} dimColor={selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN'} wrap="truncate-end">
				{getPullRequestLabel(selectedRow)}: {formatPullRequest(selectedRow)}
			</Text>
			{pullRequestTitle ? <Text dimColor={selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN'} wrap="truncate-end">{getPullRequestTitleLabel(selectedRow)}: {pullRequestTitle}</Text> : undefined}
			<SectionHeader label="Action" />
			<Text color={getActionColor(selectedRow)} wrap="truncate-end">
				{actionMessage}
			</Text>
			<SectionHeader label="Notes" />
			<Text dimColor wrap="truncate-end">
				{getNotes(selectedRow)}
			</Text>
		</Box>
	);
}
