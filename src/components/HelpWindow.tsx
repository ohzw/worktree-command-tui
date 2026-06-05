import React from 'react';
import {Box, Text} from 'ink';

interface HelpLine {
	section: string;
	binding: string;
	description: string;
}

const BASE_HELP_LINES: HelpLine[] = [
	{section: 'Movement', binding: '↑↓/jk', description: 'move selection'},
	{section: 'Movement', binding: 'g/G', description: 'first/last'},
	{section: 'Scroll', binding: 'Wheel', description: 'pane under cursor'},
	{section: 'Scroll', binding: 'PageUp/PageDn', description: 'selection page'},
	{section: 'Logs', binding: 'L', description: 'full-screen logs'},
	{section: 'Logs', binding: '[/]', description: 'scroll log'},
	{section: 'Actions', binding: 'Enter', description: 'start/switch worktree'},
	{section: 'Actions', binding: 's', description: 'stop active session'},
	{section: 'Actions', binding: 'r', description: 'refresh'},
	{section: 'Actions', binding: 'q', description: 'quit'},
	{section: 'Help', binding: 'Esc/q/?', description: 'close help'},
];

function getHelpLines(setupAvailable: boolean): HelpLine[] {
	if (!setupAvailable) {
		return BASE_HELP_LINES;
	}

	return [
		...BASE_HELP_LINES.slice(0, 8),
		{section: 'Actions', binding: 'i', description: 'setup selected worktree'},
		...BASE_HELP_LINES.slice(8),
	];
}

export function HelpWindow({setupAvailable, width, height}: {setupAvailable: boolean; width: number; height: number}) {
	let previousSection = '';

	return (
		<Box width={width} height={height} borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1}>
			<Text bold color="blue" wrap="truncate-end">Keyboard Help</Text>
			<Text dimColor wrap="truncate-end">Primary shortcuts are shown in the status footer. Advanced shortcuts live here.</Text>
			{getHelpLines(setupAvailable).map(line => {
				const section = line.section === previousSection ? '' : line.section;
				previousSection = line.section;
				return (
					<Box key={`${line.section}-${line.binding}`} flexDirection="row">
						<Box width={10}><Text dimColor wrap="truncate-end">{section}</Text></Box>
						<Box width={16}><Text color="white" wrap="truncate-end">{line.binding}</Text></Box>
						<Text dimColor wrap="truncate-end">{line.description}</Text>
					</Box>
				);
			})}
		</Box>
	);
}
