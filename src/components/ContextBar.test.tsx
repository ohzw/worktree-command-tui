import React, {type ReactElement, type ReactNode} from 'react';
import {describe, expect, it} from 'vitest';
import {ContextBar} from './ContextBar.js';

type InspectableElement = ReactElement<{children?: ReactNode; color?: string; dimColor?: boolean}>;

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

function collectElements(node: ReactNode): InspectableElement[] {
	if (Array.isArray(node)) {
		return node.flatMap(child => collectElements(child));
	}

	if (!React.isValidElement<{children?: ReactNode}>(node)) {
		return [];
	}

	return [node, ...collectElements(node.props.children)];
}

describe('ContextBar', () => {
	it('renders key bindings in white while leaving key labels dimmed', () => {
		const tree = ContextBar({status: {kind: 'idle', message: 'ready'}, setupAvailable: true, editorAvailable: true, confirmationOpen: false});
		const whiteText = collectElements(tree)
			.filter(element => element.props.color === 'white')
			.map(element => textContent(element.props.children));

		expect(whiteText).toEqual(expect.arrayContaining(['↑↓/jk', 'Enter', 'i', 'e', 'o', 'd', 'L', 's', 'r', '?', 'q']));
		expect(whiteText).not.toContain('PageUp');
		expect(whiteText).not.toContain('Switch');
	});

	it('dims labels and separators without dimming the key bindings container', () => {
		const tree = ContextBar({status: {kind: 'idle', message: 'ready'}, setupAvailable: false, editorAvailable: false, confirmationOpen: false});
		const textElements = collectElements(tree);
		const helpContainer = textElements.find(element => textContent(element.props.children).startsWith('↑↓/jk'));
		const dimmedText = textElements
			.filter(element => element.props.dimColor === true)
			.map(element => textContent(element.props.children));

		expect(helpContainer?.props.dimColor).not.toBe(true);
		expect(textContent(tree)).not.toContain('Keys:');
		expect(dimmedText).toEqual(expect.arrayContaining([' Move', ' | ']));
		expect(dimmedText).not.toContain('↑↓/jk');
	});

	it('swaps normal shortcuts for delete confirmation hints when armed', () => {
		const tree = ContextBar({status: {kind: 'idle', message: 'Delete feat/a?'}, setupAvailable: true, editorAvailable: true, confirmationOpen: true});
		const text = textContent(tree);

		expect(text).toContain('d/y');
		expect(text).toContain('Confirm');
		expect(text).toContain('Esc/n/q');
		expect(text).toContain('Cancel');
		expect(text).not.toContain('Enter');
	});

	it('hides the editor shortcut when no editor command is configured', () => {
		const tree = ContextBar({status: {kind: 'idle', message: 'ready'}, setupAvailable: true, editorAvailable: false, confirmationOpen: false});
		const whiteText = collectElements(tree)
			.filter(element => element.props.color === 'white')
			.map(element => textContent(element.props.children));

		expect(whiteText).not.toContain('e');
	});
});
