import {Box, Text} from 'ink';
import type {AppLogEntry} from '../core/runtime.js';

const ANSI_ESCAPE_PATTERN = /(?:\u001B|\u009B)\[[0-?]*[ -/]*[@-~]/gu;

function sanitizeLogLine(value: string): string {
	return value
		.replace(ANSI_ESCAPE_PATTERN, '')
		.replace(/[\r\t\u2028\u2029]+/g, ' ')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
		.replace(/\p{Cf}/gu, '')
		.trimEnd();
}

type LineSpec = {text: string; color?: 'cyan'; dimColor?: boolean};

export function buildLogLines(logs: AppLogEntry[]): LineSpec[] {
	if (logs.length === 0) {
		return [{text: 'No *.log files yet.', dimColor: true}];
	}

	const lines: LineSpec[] = [];
	for (const [index, log] of logs.entries()) {
		if (index > 0) {
			lines.push({text: ' ', dimColor: true});
		}
		lines.push({text: `[${log.name}]`, color: 'cyan'});
		const contentLines = log.content.length > 0 ? log.content.split('\n') : ['(empty)'];
		for (const line of contentLines) {
			lines.push({text: sanitizeLogLine(line) || ' '});
		}
	}

	return lines;
}

function getScrollbarThumbRows(totalLines: number, viewportHeight: number, scrollOffset: number): Set<number> {
	if (totalLines <= viewportHeight) {
		return new Set();
	}

	const thumbSize = Math.max(1, Math.floor((viewportHeight / totalLines) * viewportHeight));
	const maxScrollOffset = Math.max(1, totalLines - viewportHeight);
	const thumbStart = Math.round((scrollOffset / maxScrollOffset) * (viewportHeight - thumbSize));
	return new Set(Array.from({length: thumbSize}, (_, index) => thumbStart + index));
}

export function LogPanel({
	logs,
	width,
	height,
	scrollOffset = 0,
}: {
	logs: AppLogEntry[];
	width?: number;
	height?: number;
	scrollOffset?: number;
}) {
	const lines = buildLogLines(logs);
	const contentViewportHeight = height === undefined ? lines.length : Math.max(1, height - 3);
	const maxScrollOffset = contentViewportHeight === undefined ? 0 : Math.max(0, lines.length - contentViewportHeight);
	const effectiveScrollOffset = Math.min(Math.max(scrollOffset, 0), maxScrollOffset);
	const startIndex = contentViewportHeight === undefined
		? 0
		: Math.max(0, lines.length - contentViewportHeight - effectiveScrollOffset);
	const visibleLines = contentViewportHeight === undefined
		? lines
		: lines.slice(startIndex, startIndex + contentViewportHeight);
	const showScrollbar = contentViewportHeight !== undefined && lines.length > contentViewportHeight;
	const scrollbarThumbRows = showScrollbar
		? getScrollbarThumbRows(lines.length, contentViewportHeight, maxScrollOffset - effectiveScrollOffset)
		: new Set<number>();

	return (
		<Box width={width} height={height} borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1} overflow="hidden">
			<Text bold color="yellow" wrap="truncate-end">
				Logs (*.log · tail 120)
			</Text>
			<Box height={contentViewportHeight} flexDirection="column" overflow="hidden">
				{visibleLines.map((line, index) => (
					<Box key={`${startIndex + index}-${line.text}`} flexDirection="row">
						<Box flexGrow={1} flexShrink={1}>
							<Text color={line.color} dimColor={line.dimColor} wrap="truncate-end">
								{line.text}
							</Text>
						</Box>
						{showScrollbar ? (
							<Text color={scrollbarThumbRows.has(index) ? 'yellow' : 'gray'} dimColor={!scrollbarThumbRows.has(index)}>
								{scrollbarThumbRows.has(index) ? '█' : '│'}
							</Text>
						) : null}
					</Box>
				))}
			</Box>
		</Box>
	);
}
