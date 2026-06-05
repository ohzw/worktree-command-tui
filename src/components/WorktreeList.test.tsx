import React, {type ReactElement, type ReactNode} from 'react';
import {describe, expect, it} from 'vitest';
import {WorktreeList} from './WorktreeList.js';
import type {AppRow} from '../core/runtime.js';

type InspectableElement = ReactElement<{children?: ReactNode; color?: string; dimColor?: boolean}>;

function textContent(node: ReactNode): string {
	if (typeof node === 'string' || typeof node === 'number') {
		return String(node);
	}

	if (Array.isArray(node)) {
		return node.map(textContent).join('');
	}

	if (React.isValidElement<{children?: ReactNode}>(node)) {
		return textContent(node.props.children);
	}

	return '';
}

function collectElements(node: ReactNode): InspectableElement[] {
	if (Array.isArray(node)) {
		return node.flatMap(child => collectElements(child));
	}

	if (!React.isValidElement<{children?: ReactNode}>(node)) {
		return [];
	}

	return [node, ...collectElements(node.props.children)];
}

describe('WorktreeList', () => {
	it('does not apply yellow color to external rows', () => {
		const rows: AppRow[] = [
			{path: '/repo/.worktree/feat-a', shortPath: '.worktree/feat-a', branch: 'feat/a', tags: ['active']},
			{path: '/repo-other', shortPath: '/repo-other', branch: 'fix/x', tags: ['external']},
		];

		const tree = WorktreeList({rows, selectedIndex: 0, width: 80, height: 10, stacked: false});
		const textElements = collectElements(tree);
		const externalRow = textElements.find(element => textContent(element.props.children).includes('fix/x'));

		expect(externalRow).toBeDefined();
		expect(externalRow?.props.color).not.toBe('yellow');
	});
});
