import React from 'react';
import {Box, Text} from 'ink';
import {Spinner} from '@inkjs/ui';
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


interface KeyHint {
	binding: string;
	label: string;
}

function buildKeyHints(setupAvailable: boolean, editorAvailable: boolean, confirmationOpen: boolean): KeyHint[] {
	if (confirmationOpen) {
		return [
			{binding: 'd/y', label: 'Confirm'},
			{binding: 'Esc/n/q', label: 'Cancel'},
		];
	}

	const hints: KeyHint[] = [
		{binding: '↑↓/jk', label: 'Move'},
		{binding: 'Enter', label: 'Switch'},
	];
	if (setupAvailable) {
		hints.push({binding: 'i', label: 'Setup'});
	}
	if (editorAvailable) {
		hints.push({binding: 'e', label: 'Editor'});
	}

	hints.push(
		{binding: 'o', label: 'Open PR'},
		{binding: 'd', label: 'Delete'},
		{binding: 'L', label: 'Logs'},
		{binding: 's', label: 'Stop'},
		{binding: 'r', label: 'Refresh'},
		{binding: '?', label: 'Help'},
		{binding: 'q', label: 'Quit'},
	);

	return hints;
}

export function ContextBar({
	status,
	setupAvailable,
	editorAvailable,
	confirmationOpen,
}: {
	status: AppStatus;
	setupAvailable: boolean;
	editorAvailable: boolean;
	confirmationOpen: boolean;
}) {
	const isBusy = status.kind === 'setting-up' || status.kind === 'starting' || status.kind === 'stopping';
	const keyHints = buildKeyHints(setupAvailable, editorAvailable, confirmationOpen);
	const statusMessage = sanitizeInlineText(status.message);

	return (
		<Box borderStyle="round" borderColor={KIND_TO_COLOR[status.kind]} flexDirection="column" paddingX={1}>
			{isBusy ? (
				<Spinner label={`Status: ${status.kind} — ${statusMessage}`} />
			) : (
				<Text color={KIND_TO_COLOR[status.kind]} wrap="truncate-end">
					{KIND_TO_ICON[status.kind]} Status: {status.kind} — {statusMessage}
				</Text>
			)}
			<Text wrap="truncate-end">
				{keyHints.map((hint, hintIndex) => (
					<React.Fragment key={hint.binding}>
						{hintIndex === 0 ? null : <Text dimColor> | </Text>}
						<Text color="white">{hint.binding}</Text>
						<Text dimColor> {hint.label}</Text>
					</React.Fragment>
				))}
			</Text>
		</Box>
	);
}
