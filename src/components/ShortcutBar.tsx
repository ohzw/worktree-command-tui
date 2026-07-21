import React from 'react';
import {Box, Text} from 'ink';

interface KeyHint {
	binding: string;
	label: string;
}

function buildKeyHints(setupAvailable: boolean, editorAvailable: boolean, confirmationOpen: boolean): KeyHint[] {
	if (confirmationOpen) {
		return [
			{binding: 'd/y', label: 'Confirm'},
			{binding: 'Esc/n/q', label: 'Cancel'},
		];
	}

	const hints: KeyHint[] = [
		{binding: '↑↓/jk', label: 'Move'},
		{binding: 'Enter', label: 'Switch'},
	];
	hints.push({binding: '/', label: 'Filter'});

	if (setupAvailable) {
		hints.push({binding: 'i', label: 'Setup'});
	}
	if (editorAvailable) {
		hints.push({binding: 'e', label: 'Editor'});
	}

	hints.push(
		{binding: 'o', label: 'Open PR'},
		{binding: 'd', label: 'Delete'},
		{binding: 'L', label: 'Logs'},
		{binding: 's', label: 'Stop'},
		{binding: 'r', label: 'Refresh'},
		{binding: '?', label: 'Help'},
		{binding: 'q', label: 'Quit'},
	);

	return hints;
}

export function ShortcutBar({
	setupAvailable,
	editorAvailable,
	confirmationOpen,
}: {
	setupAvailable: boolean;
	editorAvailable: boolean;
	confirmationOpen: boolean;
}) {
	const keyHints = buildKeyHints(setupAvailable, editorAvailable, confirmationOpen);

	return (
		<Box flexShrink={0} paddingX={1}>
			<Text wrap="truncate-end">
				{keyHints.map((hint, hintIndex) => (
					<React.Fragment key={hint.binding}>
						{hintIndex === 0 ? null : <Text dimColor> | </Text>}
						<Text color="white">{hint.binding}</Text>
						<Text dimColor> {hint.label}</Text>
					</React.Fragment>
				))}
			</Text>
		</Box>
	);
}
