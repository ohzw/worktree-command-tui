import React from 'react';
import {Text} from 'ink';
import type {AppStatus} from '../core/runtime.js';

const COLOR_BY_KIND: Record<AppStatus['kind'], 'white' | 'yellow' | 'green' | 'red'> = {
	idle: 'white',
	starting: 'yellow',
	running: 'green',
	stopping: 'yellow',
	error: 'red',
};

export function StatusBar({status}: {status: AppStatus}) {
	return <Text color={COLOR_BY_KIND[status.kind]}>status: {status.kind} — {status.message}</Text>;
}
