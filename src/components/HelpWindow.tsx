import React from 'react';
import {Box, Text} from 'ink';

interface HelpLine {
	section: string;
	binding: string;
	description: string;
}

function buildHelpLines(setupAvailable: boolean, editorAvailable: boolean): HelpLine[] {
	const lines: HelpLine[] = [
		{section: 'Movement', binding: '↑↓/jk', description: 'move selection'},
		{section: 'Movement', binding: 'g/G', description: 'first/last'},
		{section: 'Scroll', binding: 'Wheel', description: 'pane under cursor'},
		{section: 'Scroll', binding: 'PageUp/PageDn', description: 'selection page'},
		{section: 'Logs', binding: 'L', description: 'full-screen logs'},
		{section: 'Logs', binding: '[/]', description: 'scroll log'},
		{section: 'Actions', binding: 'Enter', description: 'start/switch/restart worktree'},
		{section: 'Filter', binding: '/', description: 'filter by branch, path, or pull request'},
		{section: 'Filter', binding: 'Esc', description: 'clear filter'},
	];
	if (setupAvailable) {
		lines.push({section: 'Actions', binding: 'i', description: 'setup selected worktree'});
	}
	if (editorAvailable) {
		lines.push({section: 'Actions', binding: 'e', description: 'open selected worktree in editor'});
	}
	lines.push(
		{section: 'Actions', binding: 'o', description: 'open selected pull request'},
		{section: 'Actions', binding: 'd', description: 'arm worktree deletion'},
		{section: 'Actions', binding: 's', description: 'stop active session'},
		{section: 'Actions', binding: 'r', description: 'refresh'},
		{section: 'Actions', binding: 'q', description: 'quit'},
		{section: 'Help', binding: 'Esc/q/?', description: 'close help'},
		{section: 'Help', binding: 'd/y', description: 'confirm delete after arming'},
		{section: 'Help', binding: 'Esc/n/q', description: 'cancel delete confirmation'},
	);
	return lines;
}

export function HelpWindow({setupAvailable, editorAvailable, width, height}: {setupAvailable: boolean; editorAvailable: boolean; width: number; height: number}) {
	let previousSection = '';

	return (
		<Box width={width} height={height} borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1}>
			<Text bold color="blue" wrap="truncate-end">Keyboard Help</Text>
			<Text dimColor wrap="truncate-end">Primary shortcuts are shown in the status footer. Advanced shortcuts live here.</Text>
			{buildHelpLines(setupAvailable, editorAvailable).map(line => {
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
