import React from 'react';
import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

const MIN_BRANCH_WIDTH = 24;

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

export function WorktreeList({rows, selectedIndex, width}: {rows: AppRow[]; selectedIndex: number; width: number}) {
	const branchWidth = Math.max(MIN_BRANCH_WIDTH, width - 7);

	return (
		<Box width={width} borderStyle="round" flexDirection="column" paddingX={1} marginRight={1}>
			<Text bold>Worktrees</Text>
			{rows.map((row, index) => {
				const pointer = index === selectedIndex ? '❯' : ' ';
				return (
					<Text key={row.path} color={index === selectedIndex ? 'cyan' : undefined} dimColor={index !== selectedIndex} wrap="truncate-end">
						{pointer} {getIndicator(row)} {truncateLabel(row.branch, branchWidth)}
					</Text>
				);
			})}
		</Box>
	);
}
