import {Box, Text} from 'ink';
import type {AppRow} from '../core/runtime.js';

const MIN_BRANCH_WIDTH = 24;

function sanitizeInlineText(value: string): string {
	return value
		.replace(/[\r\n\t\u2028\u2029]+/g, ' ')
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
		.replace(/\p{Cf}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function getIndicator(row: AppRow): string {
	if (row.tags.includes('active')) {
		return '*';
	}
	if (row.tags.includes('invalid')) {
		return '!';
	}
	if (row.tags.includes('external')) {
		return '^';
	}
	if (row.tags.includes('main')) {
		return '#';
	}
	return '-';
}

function getRowColor(row: AppRow, isSelected: boolean): 'cyan' | 'green' | 'red' | 'yellow' | 'blue' | undefined {
	if (row.tags.includes('active')) {
		return 'green';
	}
	if (isSelected) {
		return 'cyan';
	}
	if (row.tags.includes('invalid')) {
		return 'red';
	}
	if (row.tags.includes('external')) {
		return 'yellow';
	}
	if (row.tags.includes('main')) {
		return 'blue';
	}
	return undefined;
}

function truncateLabel(value: string, width: number): string {
	if (value.length <= width) {
		return value;
	}
	return `${value.slice(0, Math.max(width - 1, 0))}…`;
}

export function WorktreeList({
	rows,
	selectedIndex,
	width,
	height,
	stacked,
}: {
	rows: AppRow[];
	selectedIndex: number;
	width?: number;
	height?: number;
	stacked: boolean;
}) {
	const branchWidth = Math.max(MIN_BRANCH_WIDTH, (width ?? 34) - 7);

	return (
		<Box
			width={width}
			height={height}
			flexGrow={stacked ? 0 : 1}
			marginRight={stacked ? 0 : 1}
			borderStyle="round"
			borderColor="cyan"
			flexDirection="column"
			paddingX={1}
			overflowY="hidden"
		>
			<Text bold color="cyan">
				Worktrees
			</Text>
			{rows.map((row, index) => {
				const isSelected = index === selectedIndex;
				const line = `${isSelected ? '>' : ' '} ${getIndicator(row)} ${truncateLabel(sanitizeInlineText(row.branch), branchWidth)}`;
				return (
					<Text key={row.path} color={getRowColor(row, isSelected)} dimColor={!isSelected && getRowColor(row, isSelected) === undefined} wrap="truncate-end">
						{line}
					</Text>
				);
			})}
		</Box>
	);
}
