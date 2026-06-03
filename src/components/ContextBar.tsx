import React from 'react';
import {Box, Text} from 'ink';
import type {AppStatus} from '../core/runtime.js';

const COLOR_BY_KIND: Record<AppStatus['kind'], 'blue' | 'yellow' | 'green' | 'red'> = {
	idle: 'blue',
	starting: 'yellow',
	running: 'green',
	stopping: 'yellow',
	error: 'red',
};

export function ContextBar({status}: {status: AppStatus}) {
	return (
		<Box borderStyle="round" borderColor={COLOR_BY_KIND[status.kind]} flexDirection="column" paddingX={1}>
			<Text color={COLOR_BY_KIND[status.kind]} wrap="truncate-end">
				Status: {status.kind} — {status.message}
			</Text>
			<Text dimColor wrap="truncate-end">
				Keys: ↑↓/jk move  g/G first/last  Enter start/switch  s stop  r refresh  q quit
			</Text>
		</Box>
	);
}
