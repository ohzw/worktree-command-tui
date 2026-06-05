import {Box, Text} from 'ink';
import type {AppLogEntry} from '../core/runtime.js';
import {getScrollbarThumbRows, sliceTailViewport} from '../terminal/viewport.js';

const ESCAPE = '\u001B';
const CSI = '\u009B';
const BEL = '\u0007';
const STRING_TERMINATOR_PREFIX = '\u001B';
const STRING_TERMINATOR_SUFFIX = '\\';
const STRING_TERMINATOR = '\u009C';
const DEVICE_CONTROL_STRING = '\u0090';
const START_OF_STRING = '\u0098';
const OPERATING_SYSTEM_COMMAND = '\u009D';
const PRIVACY_MESSAGE = '\u009E';
const APPLICATION_PROGRAM_COMMAND = '\u009F';

type LogColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';
type LineStyle = {color?: LogColor; dimColor?: boolean; bold?: boolean};
type LineSegment = {text: string} & LineStyle;
type LineSpec = {segments: LineSegment[]};

const ANSI_FOREGROUND_COLORS = new Map<number, LogColor>([
	[30, 'black'],
	[31, 'red'],
	[32, 'green'],
	[33, 'yellow'],
	[34, 'blue'],
	[35, 'magenta'],
	[36, 'cyan'],
	[37, 'white'],
	[90, 'gray'],
	[91, 'red'],
	[92, 'green'],
	[93, 'yellow'],
	[94, 'blue'],
	[95, 'magenta'],
	[96, 'cyan'],
	[97, 'white'],
]);

function sanitizeTextChunk(value: string): string {
	return value
		.replace(/[\r\t\u2028\u2029]+/g, ' ')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
		.replace(/\p{Cf}/gu, '');
}

function sameStyle(a: LineStyle, b: LineStyle): boolean {
	return a.color === b.color && a.dimColor === b.dimColor && a.bold === b.bold;
}

function appendSegment(segments: LineSegment[], text: string, style: LineStyle): void {
	if (text.length === 0) {
		return;
	}
	const last = segments.at(-1);
	if (last && sameStyle(last, style)) {
		last.text += text;
		return;
	}
	segments.push({...style, text});
}

function skipExtendedColor(codes: string[], index: number): number {
	const mode = Number(codes[index + 1] ?? Number.NaN);
	if (mode === 5) {
		return index + 2;
	}
	if (mode === 2) {
		return index + 4;
	}
	return index;
}

function applyAnsiSgr(style: LineStyle, parameters: string): void {
	const codes = parameters.length === 0 ? ['0'] : parameters.split(';');
	for (let index = 0; index < codes.length; index += 1) {
		const rawCode = codes[index] ?? '0';
		if (rawCode.includes(':')) {
			if (Number(rawCode.split(':', 1)[0]) === 38) {
				delete style.color;
			}
			continue;
		}
		const code = Number(rawCode || 0);
		if (code === 0) {
			delete style.color;
			delete style.dimColor;
			delete style.bold;
			continue;
		}
		if (code === 1) {
			style.bold = true;
			continue;
		}
		if (code === 2) {
			style.dimColor = true;
			continue;
		}
		if (code === 22) {
			delete style.bold;
			delete style.dimColor;
			continue;
		}
		if (code === 38) {
			delete style.color;
			index = skipExtendedColor(codes, index);
			continue;
		}
		if (code === 48 || code === 58) {
			index = skipExtendedColor(codes, index);
			continue;
		}
		if (code === 39) {
			delete style.color;
			continue;
		}
		const color = ANSI_FOREGROUND_COLORS.get(code);
		if (color) {
			style.color = color;
		}
	}
}

function trimLineEnd(segments: LineSegment[]): LineSegment[] {
	const result = [...segments];
	while (result.length > 0) {
		const last = result.at(-1)!;
		const trimmed = last.text.trimEnd();
		if (trimmed.length > 0) {
			if (trimmed.length !== last.text.length) {
				result[result.length - 1] = {...last, text: trimmed};
			}
			break;
		}
		result.pop();
	}
	return result;
}

function pushLine(lines: LineSpec[], segments: LineSegment[]): void {
	const trimmedSegments = trimLineEnd(segments);
	lines.push({segments: trimmedSegments.length > 0 ? trimmedSegments : [{text: ' '}]});
}

function isAnsiFinalByte(value: string): boolean {
	const code = value.charCodeAt(0);
	return code >= 0x40 && code <= 0x7E;
}

function isAnsiIntermediateByte(value: string): boolean {
	const code = value.charCodeAt(0);
	return code >= 0x20 && code <= 0x2F;
}

function consumeCsi(value: string, index: number, style: LineStyle): number {
	let cursor = index;
	while (cursor < value.length && !isAnsiFinalByte(value[cursor]!)) {
		cursor += 1;
	}
	if (cursor >= value.length) {
		return value.length;
	}
	const finalByte = value[cursor]!;
	const sequence = value.slice(index, cursor);
	const hasIntermediate = Array.from(sequence).some(isAnsiIntermediateByte);
	if (!hasIntermediate && finalByte === 'm') {
		applyAnsiSgr(style, sequence);
	}
	return cursor + 1;
}

function consumeStringControl(value: string, index: number, allowBelTerminator: boolean): number {
	let cursor = index;
	while (cursor < value.length) {
		if ((allowBelTerminator && value[cursor] === BEL) || value[cursor] === STRING_TERMINATOR) {
			return cursor + 1;
		}
		if (value[cursor] === STRING_TERMINATOR_PREFIX && value[cursor + 1] === STRING_TERMINATOR_SUFFIX) {
			return cursor + 2;
		}
		cursor += 1;
	}
	return value.length;
}

function isStringControl(value: string | undefined): boolean {
	return value === DEVICE_CONTROL_STRING
		|| value === START_OF_STRING
		|| value === OPERATING_SYSTEM_COMMAND
		|| value === PRIVACY_MESSAGE
		|| value === APPLICATION_PROGRAM_COMMAND;
}

function consumeEscape(value: string, index: number, style: LineStyle): number {
	if (value[index] === CSI) {
		return consumeCsi(value, index + 1, style);
	}
	if (isStringControl(value[index])) {
		return consumeStringControl(value, index + 1, value[index] === OPERATING_SYSTEM_COMMAND);
	}
	const next = value[index + 1];
	if (next === undefined) {
		return index + 1;
	}
	if (next === '[') {
		return consumeCsi(value, index + 2, style);
	}
	if (next === ']') {
		return consumeStringControl(value, index + 2, true);
	}
	if (next === 'P' || next === '^' || next === '_' || next === 'X') {
		return consumeStringControl(value, index + 2, false);
	}
	let cursor = index + 1;
	while (cursor < value.length && isAnsiIntermediateByte(value[cursor]!)) {
		cursor += 1;
	}
	return Math.min(cursor + 1, value.length);
}

function parseLogContent(value: string): LineSpec[] {
	const lines: LineSpec[] = [];
	let segments: LineSegment[] = [];
	const style: LineStyle = {};
	let textStart = 0;
	let index = 0;

	while (index < value.length) {
		const character = value[index];
		if (character === '\n') {
			appendSegment(segments, sanitizeTextChunk(value.slice(textStart, index)), style);
			pushLine(lines, segments);
			segments = [];
			index += 1;
			textStart = index;
			continue;
		}
		if (character === ESCAPE || character === CSI || isStringControl(character)) {
			appendSegment(segments, sanitizeTextChunk(value.slice(textStart, index)), style);
			index = consumeEscape(value, index, style);
			textStart = index;
			continue;
		}
		index += 1;
	}

	appendSegment(segments, sanitizeTextChunk(value.slice(textStart)), style);
	pushLine(lines, segments);
	return lines;
}

function plainLine(text: string, style: LineStyle = {}): LineSpec {
	return {segments: [{...style, text}]};
}

function getLineText(line: LineSpec): string {
	return line.segments.map(segment => segment.text).join('');
}

export function buildLogLines(logs: AppLogEntry[]): LineSpec[] {
	if (logs.length === 0) {
		return [plainLine('No *.log files yet.', {dimColor: true})];
	}

	const lines: LineSpec[] = [];
	for (const [index, log] of logs.entries()) {
		if (index > 0) {
			lines.push(plainLine(' ', {dimColor: true}));
		}
		lines.push(plainLine(`[${log.name}]`, {color: 'cyan'}));
		lines.push(...parseLogContent(log.content.length > 0 ? log.content : '(empty)'));
	}

	return lines;
}


export function LogPanel({
	logs,
	width,
	height,
	scrollOffset = 0,
	title = 'Logs (*.log · tail 120)',
}: {
	logs: AppLogEntry[];
	width?: number;
	height?: number;
	scrollOffset?: number;
	title?: string;
}) {
	const lines = buildLogLines(logs);
	const viewport = sliceTailViewport(lines, height === undefined ? lines.length : height - 3, scrollOffset);
	const contentViewportHeight = viewport.viewportHeight;
	const startIndex = viewport.startIndex;
	const visibleLines = viewport.visibleItems;
	const showScrollbar = height !== undefined && lines.length > contentViewportHeight;
	const scrollbarThumbRows = showScrollbar
		? getScrollbarThumbRows(lines.length, contentViewportHeight, viewport.topScrollOffset)
		: new Set<number>();

	return (
		<Box width={width} height={height} borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1} overflow="hidden">
			<Text bold color="yellow" wrap="truncate-end">
				{title}
			</Text>
			<Box height={contentViewportHeight} flexDirection="column" overflow="hidden">
				{visibleLines.map((line, index) => (
					<Box key={`${startIndex + index}-${getLineText(line)}`} flexDirection="row">
						<Box flexGrow={1} flexShrink={1}>
							<Text wrap="truncate-end">
								{line.segments.map((segment, segmentIndex) => (
									<Text
										key={`${segmentIndex}-${segment.text}`}
										color={segment.color}
										dimColor={segment.dimColor}
										bold={segment.bold}
									>
										{segment.text}
									</Text>
								))}
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
