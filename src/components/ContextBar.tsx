import React from 'react';
import {Box, Text} from 'ink';
import {Spinner} from '@inkjs/ui';
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

function buildKeyHints(setupAvailable: boolean): KeyHint[] {
	const hints: KeyHint[] = [
		{binding: '↑↓/jk', label: 'Move'},
		{binding: 'Enter', label: 'Switch'},
	];
	if (setupAvailable) {
		hints.push({binding: 'i', label: 'Setup'});
	}

	hints.push(
		{binding: 'L', label: 'Logs'},
		{binding: 's', label: 'Stop'},
		{binding: 'r', label: 'Refresh'},
		{binding: '?', label: 'Help'},
		{binding: 'q', label: 'Quit'},
	);

	return hints;
}

export function ContextBar({status, setupAvailable}: {status: AppStatus; setupAvailable: boolean}) {
	const isBusy = status.kind === 'setting-up' || status.kind === 'starting' || status.kind === 'stopping';
	const keyHints = buildKeyHints(setupAvailable);

	return (
		<Box borderStyle="round" borderColor={KIND_TO_COLOR[status.kind]} flexDirection="column" paddingX={1}>
			{isBusy ? (
				<Spinner label={`Status: ${status.kind} — ${status.message}`} />
			) : (
				<Text color={KIND_TO_COLOR[status.kind]} wrap="truncate-end">
					{KIND_TO_ICON[status.kind]} Status: {status.kind} — {status.message}
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
