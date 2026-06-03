import React from 'react';
import {Box, Text} from 'ink';
import {Spinner} from '@inkjs/ui';
import type {AppStatus} from '../core/runtime.js';

const KIND_TO_ICON: Record<AppStatus['kind'], 'ℹ' | '⚠' | '✓' | '✘'> = {
	idle: 'ℹ',
	starting: '⚠',
	running: '✓',
	stopping: '⚠',
	error: '✘',
};

const KIND_TO_COLOR = {
	idle: 'blue',
	starting: 'yellow',
	running: 'green',
	stopping: 'yellow',
	error: 'red',
} as const;

export function ContextBar({status}: {status: AppStatus}) {
	const isBusy = status.kind === 'starting' || status.kind === 'stopping';

	return (
		<Box borderStyle="round" borderColor={KIND_TO_COLOR[status.kind]} flexDirection="column" paddingX={1}>
			{isBusy ? (
				<Spinner label={`Status: ${status.kind} — ${status.message}`} />
			) : (
				<Text color={KIND_TO_COLOR[status.kind]} wrap="truncate-end">
					{KIND_TO_ICON[status.kind]} Status: {status.kind} — {status.message}
				</Text>
			)}
			<Text dimColor wrap="truncate-end">
				Keys: ↑↓/jk move  g/G first/last  Wheel/PgUp/PgDn selection scroll  Enter start/switch  s stop  r refresh  q quit
			</Text>
		</Box>
	);
}
