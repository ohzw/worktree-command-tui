import {describe, expect, it} from 'vitest';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {getInvalidReason} from './validation.js';

describe('getInvalidReason', () => {
	it('returns missing required files in a human-readable message', async () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'wctui-valid-'));
		writeFileSync(path.join(dir, 'package.json'), '{}');
		const reason = await getInvalidReason(dir, ['package.json', 'default.project.json']);
		expect(reason).toContain('default.project.json');
		expect(reason).not.toContain('package.json, package.json');
	});
});
