import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {readLogs, tailLogContent} from './log-reader.js';

describe('tailLogContent', () => {
	it('keeps only the configured tail content', () => {
		expect(tailLogContent('first\n' + Array.from({length: 130}, (_, index) => `line-${index}`).join('\n'))).not.toContain('first');
	});
});

describe('readLogs', () => {
	it('returns the tail of oversized log files', async () => {
		const logsDir = mkdtempSync(path.join(tmpdir(), 'wctui-logs-large-'));
		const logPath = path.join(logsDir, 'large.log');
		writeFileSync(logPath, `${'x'.repeat(100000)}\nlast-line`);

		await expect(readLogs(logsDir, logPath)).resolves.toEqual([{name: 'large.log', path: logPath, content: expect.stringContaining('last-line')}]);
	});

	it('returns no logs when an active log path is outside the bounded log list', async () => {
		const logsDir = mkdtempSync(path.join(tmpdir(), 'wctui-logs-missing-active-'));
		writeFileSync(path.join(logsDir, 'large.log'), 'ready');

		await expect(readLogs(logsDir, path.join(logsDir, 'missing.log'))).resolves.toEqual([]);
	});
});
