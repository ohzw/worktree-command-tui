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

function getRowText(tree: ReactNode, needle: string): string {
	const row = collectElements(tree).find(element => textContent(element.props.children).includes(needle));
	if (row === undefined) {
		throw new Error(`Could not find row containing ${JSON.stringify(needle)}`);
	}

	return textContent(row.props.children);
}

describe('WorktreeList', () => {
	it('renders the head summary with a short hash and sanitized commit message', () => {
		const rows: AppRow[] = [
			{
				path: '/repo/.worktree/feat-a',
				shortPath: '.worktree/feat-a',
				branch: 'feat/a',
				tags: ['active'],
				headSha: '46af3f1c',
				headCommit: {message: 'Selection\npane\u001b[2J metadata'},
			},
		];

		const tree = WorktreeList({rows, selectedIndex: 0, width: 80, height: 10, stacked: false});
		const rowText = getRowText(tree, 'feat/a');

		expect(rowText).toContain('46af3f1c Selection pane metadata');
		expect(rowText).not.toContain('\u001b');
	});

	it('truncates narrow rows without dropping branch or root indicators', () => {
		const rows: AppRow[] = [
			{
				path: '/repo',
				shortPath: '.',
				branch: 'feature/with-a-really-long-branch-name',
				tags: ['main'],
				headSha: '46af3f1c',
				headCommit: {message: 'Selection pane metadata'},
			},
		];

		const tree = WorktreeList({rows, selectedIndex: 0, width: 34, stacked: false});
		const rowText = getRowText(tree, '[root]');

		expect(rowText).toContain('> - ');
		expect(rowText).toContain('[root]');
		expect(rowText).toContain('…');
		expect(rowText).not.toContain('46af3f1c');
		expect(rowText).not.toContain('Selection pane metadata');
	});

	it('omits absent head metadata without rendering undefined or null', () => {
		const rows: AppRow[] = [
			{
				path: '/repo/.worktree/feat-b',
				shortPath: '.worktree/feat-b',
				branch: 'feat/b',
				tags: ['external'],
			},
		];

		const tree = WorktreeList({rows, selectedIndex: 0, width: 80, height: 10, stacked: false});
		const rowText = getRowText(tree, 'feat/b');

		expect(rowText).not.toContain('undefined');
		expect(rowText).not.toContain('null');
		expect(rowText).toContain('feat/b');
	});
});
