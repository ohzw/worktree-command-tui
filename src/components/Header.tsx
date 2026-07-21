import {Box, Text} from 'ink';
import {sanitizeInlineText} from '../core/worktree-projection.js';
import type {AppStatus} from '../core/runtime.js';

const KIND_TO_ICON: Record<AppStatus['kind'], 'ℹ' | '⚠' | '✓' | '✘'> = {
	idle: 'ℹ',
	starting: '⚠',
	'setting-up': '⚠',
	running: '✓',
	stopping: '⚠',
	error: '✘',
};

const KIND_TO_COLOR = {
	idle: 'blue',
	starting: 'yellow',
	'setting-up': 'yellow',
	running: 'green',
	stopping: 'yellow',
	error: 'red',
} as const;

const KIND_TO_LABEL: Record<AppStatus['kind'], string> = {
	idle: 'Idle',
	starting: 'Starting',
	'setting-up': 'Setting up',
	running: 'Running',
	stopping: 'Stopping',
	error: 'Error',
};

export function Header({
	repoName,
	activeBranch,
	status,
}: {
	repoName: string;
	activeBranch: string | null;
	status: AppStatus;
}) {
	const safeRepoName = sanitizeInlineText(repoName);
	const safeActiveBranch = activeBranch === null ? null : sanitizeInlineText(activeBranch);
	const safeStatusMessage = sanitizeInlineText(status.message);
	const branchSummary = safeActiveBranch === null
		? ''
		: status.kind === 'running' ? `: ${safeActiveBranch}` : ` · ${safeActiveBranch}`;
	let statusMessageSummary = safeStatusMessage;
	if (status.kind === 'running' && safeActiveBranch !== null) {
		if (safeStatusMessage === 'running' || safeStatusMessage === `Active: ${safeActiveBranch}`) {
			statusMessageSummary = '';
		} else if (safeStatusMessage === `started ${safeActiveBranch}`) {
			statusMessageSummary = 'started';
		} else if (safeStatusMessage === `restarted ${safeActiveBranch}`) {
			statusMessageSummary = 'restarted';
		}
	}
	const messageSummary = statusMessageSummary === '' ? '' : ` — ${statusMessageSummary}`;

	return (
		<Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1}>
			<Text bold color="blue" wrap="truncate-end">
				Repo: {safeRepoName}
			</Text>
			<Text color={KIND_TO_COLOR[status.kind]} wrap="truncate-end">
				{KIND_TO_ICON[status.kind]} {KIND_TO_LABEL[status.kind]}{branchSummary}{messageSummary}
			</Text>
		</Box>
	);
}
