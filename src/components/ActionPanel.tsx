import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

function getTagColor(tag: string): 'green' | 'yellow' | 'blue' | 'red' | 'magenta' {
	if (tag === 'active') {
		return 'green';
	}
	if (tag === 'external') {
		return 'yellow';
	}
	if (tag === 'main') {
		return 'blue';
	}
	if (tag === 'invalid') {
		return 'red';
	}
	return 'magenta';
}

export function getActionVariant(selectedRow: AppRow, activePath: string | null): 'success' | 'error' | 'info' {
	if (selectedRow.invalidReason) {
		return 'error';
	}
	if (selectedRow.path === activePath) {
		return 'success';
	}
	if ((selectedRow.workingTree?.conflicts ?? 0) > 0) {
		return 'error';
	}
	if (
		(selectedRow.workingTree?.staged ?? 0) > 0
		|| (selectedRow.workingTree?.unstaged ?? 0) > 0
		|| (selectedRow.workingTree?.untracked ?? 0) > 0
	) {
		return 'info';
	}
	return 'info';
}

function getNoteVariant(selectedRow: AppRow): 'success' | 'error' | 'info' {
	if (selectedRow.invalidReason || selectedRow.tags.includes('external')) {
		return selectedRow.invalidReason ? 'error' : 'info';
	}
	if ((selectedRow.workingTree?.conflicts ?? 0) > 0) {
		return 'error';
	}
	if (
		(selectedRow.workingTree?.staged ?? 0) > 0
		|| (selectedRow.workingTree?.unstaged ?? 0) > 0
		|| (selectedRow.workingTree?.untracked ?? 0) > 0
	) {
		return 'info';
	}
	return 'info';
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

function getNotes(selectedRow: AppRow): string {
	if (selectedRow.invalidReason) {
		return selectedRow.invalidReason;
	}
	if (selectedRow.tags.includes('external')) {
		return 'External worktree managed outside the main checkout path.';
	}
	return 'Ready to launch with the configured command in this worktree.';
}

function getOrderedTags(tags: readonly string[]): string[] {
	const tagPriority: Record<string, number> = {
		active: 0,
		main: 1,
		external: 2,
		invalid: 3,
	};
	return [...tags].sort((a, b) => {
		const aPriority = tagPriority[a] ?? 10;
		const bPriority = tagPriority[b] ?? 10;
		if (aPriority === bPriority) {
			return a.localeCompare(b);
		}
		return aPriority - bPriority;
	});
}

type LineSpec = {
	text: string;
	color?: 'cyan' | 'green' | 'yellow' | 'blue' | 'red' | 'magenta';
	dimColor?: boolean;
	bold?: boolean;
};

function getVariantColor(variant: 'success' | 'error' | 'info'): 'green' | 'red' | 'blue' {
	if (variant === 'success') {
		return 'green';
	}
	if (variant === 'error') {
		return 'red';
	}
	return 'blue';
}

function getVariantIcon(variant: 'success' | 'error' | 'info'): '✓' | '✘' | 'ℹ' {
	if (variant === 'success') {
		return '✓';
	}
	if (variant === 'error') {
		return '✘';
	}
	return 'ℹ';
}

function section(label: string): LineSpec {
	return {text: `[${label}]`, color: 'cyan', bold: true};
}

function divider(): LineSpec {
	return {text: ' ', dimColor: true};
}

function getPanelLines(selectedRow: AppRow | undefined, activePath: string | null, compactDetails: boolean): LineSpec[] {
	if (!selectedRow) {
		return [{text: 'No worktrees found.', dimColor: true}];
	}

	const lines: LineSpec[] = [section('Identity')];
	const showFullPath = !compactDetails && selectedRow.shortPath !== selectedRow.path;
	const showTags = !compactDetails;
	const pullRequestTitle = selectedRow.pullRequest?.kind === 'found' && !compactDetails
		? sanitizeInlineText(selectedRow.pullRequest.title)
		: null;

	lines.push(
		{text: `Branch: ${sanitizeInlineText(selectedRow.branch)}`, bold: true},
		{text: `Path: ${sanitizeInlineText(selectedRow.shortPath)}`},
	);
	if (showFullPath) {
		lines.push({text: `Full Path: ${sanitizeInlineText(selectedRow.path)}`});
	}
	lines.push({text: `HEAD: ${selectedRow.headSha || '-'}`});

	if (showTags) {
		for (const tag of getOrderedTags(selectedRow.tags.filter(tag => tag !== 'active'))) {
			lines.push({text: tag.toUpperCase(), color: getTagColor(tag)});
		}
	}

	lines.push(
		divider(),
		section('Git / PR'),
		{text: `Upstream: ${formatUpstream(selectedRow)}`},
		{text: `Status: ${formatWorkingTree(selectedRow)}`},
		{
			text: `${getPullRequestLabel(selectedRow)}: ${formatPullRequest(selectedRow)}`,
			color: getPullRequestColor(selectedRow),
			dimColor: selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN',
		},
	);
	if (pullRequestTitle) {
		lines.push({text: `${getPullRequestTitleLabel(selectedRow)}: ${pullRequestTitle}`, dimColor: selectedRow.pullRequest?.kind === 'found' && selectedRow.pullRequest.state !== 'OPEN'});
	}

	const actionVariant = getActionVariant(selectedRow, activePath);
	const noteVariant = getNoteVariant(selectedRow);
	lines.push(
		divider(),
		section('Action'),
		{text: `${getVariantIcon(actionVariant)} ${getActionMessage(selectedRow, activePath)}`, color: getVariantColor(actionVariant)},
		section('Notes'),
		{text: `${getVariantIcon(noteVariant)} ${getNotes(selectedRow)}`, color: getVariantColor(noteVariant)},
	);

	return lines;
}

export function ActionPanel({
	selectedRow,
	activePath,
	stacked,
	width,
	height,
	compactDetails,
	scrollOffset = 0,
}: {
	selectedRow: AppRow | undefined;
	activePath: string | null;
	stacked: boolean;
	width?: number;
	height?: number;
	compactDetails?: boolean;
	scrollOffset?: number;
}) {
	const lines = getPanelLines(selectedRow, activePath, compactDetails ?? false);
	const contentViewportHeight = height === undefined ? undefined : Math.max(1, height - 3);
	const maxScrollOffset = contentViewportHeight === undefined ? 0 : Math.max(0, lines.length - contentViewportHeight);
	const effectiveScrollOffset = Math.min(Math.max(scrollOffset, 0), maxScrollOffset);
	const visibleLines = contentViewportHeight === undefined
		? lines
		: lines.slice(effectiveScrollOffset, effectiveScrollOffset + contentViewportHeight);

	return (
		<Box width={width} height={height} flexGrow={stacked ? 0 : 1} flexShrink={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} overflow="hidden">
			<Text bold color="magenta" wrap="truncate-end">
				Selection / Action
			</Text>
			<Box height={contentViewportHeight} flexDirection="column" overflow="hidden">
				{visibleLines.map((line, index) => (
					<Text key={`${effectiveScrollOffset + index}-${line.text}`} color={line.color} dimColor={line.dimColor} bold={line.bold} wrap="truncate-end">
						{line.text}
					</Text>
				))}
			</Box>
		</Box>
	);
}
