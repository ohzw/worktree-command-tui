import React from 'react';
import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

const LIST_WIDTH = 32;
const BRANCH_WIDTH = 27;

function getIndicator(row: AppRow): string {
	if (row.tags.includes('active')) {
		return '*';
	}
	if (row.tags.includes('invalid')) {
		return '!';
	}
	if (row.tags.includes('external')) {
		return '↗';
	}
	if (row.tags.includes('main')) {
		return '•';
	}
	return ' ';
}

function truncateLabel(value: string, width: number): string {
	if (value.length <= width) {
		return value.padEnd(width, ' ');
	}
	return `${value.slice(0, Math.max(width - 1, 0))}…`;
}

export function WorktreeList({rows, selectedIndex}: {rows: AppRow[]; selectedIndex: number}) {
	return (
		<Box width={LIST_WIDTH} flexDirection="column" marginRight={1}>
			<Text bold>Worktrees</Text>
			{rows.map((row, index) => {
				const pointer = index === selectedIndex ? '❯' : ' ';
				return (
					<Text key={row.path} color={index === selectedIndex ? 'cyan' : undefined} dimColor={index !== selectedIndex} wrap="truncate-end">
						{pointer} {getIndicator(row)} {truncateLabel(row.branch, BRANCH_WIDTH)}
					</Text>
				);
			})}
		</Box>
	);
}
