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

export function ContextBar({status, setupAvailable}: {status: AppStatus; setupAvailable: boolean}) {
	const isBusy = status.kind === 'setting-up' || status.kind === 'starting' || status.kind === 'stopping';
	const setupHelp = setupAvailable ? '  i setup' : '';

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
				Keys: ↑↓/jk move  g/G first/last  Wheel/PgUp/PgDn list & selection scroll  [/] log scroll  L full-screen logs  Enter start/switch{setupHelp}  s stop  r refresh  q quit
			</Text>
		</Box>
	);
}
