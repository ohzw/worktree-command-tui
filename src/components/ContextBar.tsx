import React from 'react';
import {Box, Text} from 'ink';
import type {AppStatus} from '../core/runtime.js';

const COLOR_BY_KIND: Record<AppStatus['kind'], 'white' | 'yellow' | 'green' | 'red'> = {
	idle: 'white',
	starting: 'yellow',
	running: 'green',
	stopping: 'yellow',
	error: 'red',
};

export function ContextBar({status}: {status: AppStatus}) {
	return (
		<Box flexDirection="column" marginTop={1}>
			<Text color={COLOR_BY_KIND[status.kind]} wrap="truncate-end">
				status: {status.kind} — {status.message}
			</Text>
			<Text dimColor wrap="truncate-end">
				↑↓ move  Enter start/switch  s stop  r refresh  q quit
			</Text>
		</Box>
	);
}
