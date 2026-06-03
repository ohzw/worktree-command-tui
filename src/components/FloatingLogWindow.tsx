import {LogPanel} from './LogPanel.js';
import type {AppLogEntry} from '../core/runtime.js';

export function FloatingLogWindow({
	logs,
	width,
	height,
	scrollOffset,
}: {
	logs: AppLogEntry[];
	width: number;
	height: number;
	scrollOffset: number;
}) {
	return (
		<LogPanel
			logs={logs}
			width={width}
			height={height}
			scrollOffset={scrollOffset}
			title="Logs (*.log · tail 120 · full screen)"
		/>
	);
}
