import React from 'react';
import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

function formatTags(tags: AppRow['tags']): string {
	return tags.length === 0 ? '' : ` [${tags.join(', ')}]`;
}

export function WorktreeList({rows, selectedIndex}: {rows: AppRow[]; selectedIndex: number}) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{rows.map((row, index) => {
				const pointer = index === selectedIndex ? '❯' : ' ';
				return (
					<Text key={row.path} color={index === selectedIndex ? 'cyan' : undefined}>
						{pointer} {row.branch} — {row.shortPath}
						{formatTags(row.tags)}
					</Text>
				);
			})}
		</Box>
	);
}
