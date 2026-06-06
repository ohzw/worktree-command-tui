import React, {type ReactNode} from 'react';
import {describe, expect, it} from 'vitest';
import {Header} from './Header.js';

function textContent(node: ReactNode): string {
	if (typeof node === 'string' || typeof node === 'number') {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(child => textContent(child)).join('');
	}
	if (React.isValidElement<{children?: ReactNode}>(node)) {
		return textContent(node.props.children);
	}
	return '';
}

describe('Header', () => {
	it('sanitizes repository, namespace, and active branch text', () => {
		const tree = Header({
			repoName: 'repo\u001b]0;owned\u0007\nnext',
			namespace: 'name\u202Espace',
			activeBranch: 'feat/\u001b[2Jbad\u202E',
		});
		const text = textContent(tree);

		expect(text).toContain('Repo: repo next');
		expect(text).toContain('Active: feat/bad');
		expect(text).toContain('Namespace: namespace');
		expect(text).not.toContain('\u001b');
		expect(text).not.toContain('owned');
		expect(text).not.toContain('\u202E');
	});
});
