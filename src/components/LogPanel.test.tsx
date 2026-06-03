import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {LogPanel} from './LogPanel.js';
import type {AppLogEntry} from '../core/runtime.js';

describe('LogPanel', () => {
	it('strips ANSI escape sequences and shows the latest tail lines', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'first\n[\u001b[90m7:45:42 PM\u001b[0m] Found 0 errors. Watching for file changes.\nlast',
		}];

		const {lastFrame} = render(<LogPanel logs={logs} width={80} height={5} />);
		expect(lastFrame()).toContain('Logs (*.log · tail 120)');
		expect(lastFrame()).toContain('[7:45:42 PM] Found 0 errors. Watching for file changes.');
		expect(lastFrame()).toContain('last');
		expect(lastFrame()).not.toContain('[90m');
		expect(lastFrame()).not.toContain('[0m');
	});
});
