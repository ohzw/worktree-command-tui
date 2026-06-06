import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {LogPanel, buildLogLines} from './LogPanel.js';
import type {AppLogEntry} from '../core/runtime.js';

describe('LogPanel', () => {
	it('renders ANSI escape sequences as styled text without showing raw codes', () => {
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

	it('sanitizes log filenames before rendering them as headers', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch\u001b]0;owned\u0007\nnext.log',
			path: '/tmp/watch.log',
			content: 'ok',
		}];

		expect(buildLogLines(logs)[0]).toEqual({
			segments: [{text: '[watch next.log]', color: 'cyan'}],
		});
	});

	it('preserves ANSI SGR foreground colors in log line segments', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: '\u001b[31merror\u001b[0m then \u001b[32mok\u001b[0m',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [
				{text: 'error', color: 'red'},
				{text: ' then '},
				{text: 'ok', color: 'green'},
			],
		});
	});

	it('carries ANSI SGR color across newline boundaries until reset', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: '\u001b[31mfirst\nsecond\u001b[0m\nthird',
		}];

		expect(buildLogLines(logs).slice(1)).toEqual([
			{segments: [{text: 'first', color: 'red'}]},
			{segments: [{text: 'second', color: 'red'}]},
			{segments: [{text: 'third'}]},
		]);
	});

	it('strips unsupported escape controls without leaking their payload', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'before \u001b]8;;https://example.com\u0007label\u001b]8;;\u0007 after \u001b7done',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [{text: 'before label after done'}],
		});
	});

	it('strips 8-bit C1 string controls without leaking their payload', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'before \u009D0;secret\u0007 after',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [{text: 'before  after'}],
		});
	});

	it('ends string controls at C1 string terminators', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'before \u001b]0;title\u009C after',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [{text: 'before  after'}],
		});
	});

	it('does not end non-OSC string controls at BEL', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'before \u001bPhidden\u0007leaked\u001b\\ after',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [{text: 'before  after'}],
		});
	});

	it('clears color for unsupported extended ANSI foreground colors', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: '\u001b[31mred \u001b[38;5;244mextended',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [
				{text: 'red ', color: 'red'},
				{text: 'extended'},
			],
		});
	});

	it('does not treat unsupported extended background colors as foreground colors', () => {
		const logs: AppLogEntry[] = [{
			name: 'watch.log',
			path: '/tmp/watch.log',
			content: 'plain \u001b[48;5;31mbackground \u001b[58;5;32munderline',
		}];

		expect(buildLogLines(logs)[1]).toEqual({
			segments: [{text: 'plain background underline'}],
		});
	});
});
