type ResizeListener = (...args: unknown[]) => void;

interface ResizeEventSource {
	on(event: string | symbol, listener: ResizeListener): ResizeEventSource;
	off(event: string | symbol, listener: ResizeListener): ResizeEventSource;
}

export function debounceResizeListeners(source: ResizeEventSource, debounceMs: number): () => void {
	const originalOn = source.on.bind(source);
	const originalOff = source.off.bind(source);
	const resizeListeners = new Set<ResizeListener>();
	let resizeTimer: NodeJS.Timeout | undefined;
	let latestArgs: unknown[] = [];

	const emitDebouncedResize = (...args: unknown[]) => {
		latestArgs = args;
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			resizeTimer = undefined;
			const listeners = [...resizeListeners];
			for (const listener of listeners) {
				listener(...latestArgs);
			}
		}, debounceMs);
	};

	originalOn('resize', emitDebouncedResize);
	source.on = ((event: string | symbol, listener: ResizeListener) => {
		if (event === 'resize') {
			resizeListeners.add(listener);
			return source;
		}

		return originalOn(event, listener);
	}) as ResizeEventSource['on'];
	source.off = ((event: string | symbol, listener: ResizeListener) => {
		if (event === 'resize') {
			resizeListeners.delete(listener);
			return source;
		}

		return originalOff(event, listener);
	}) as ResizeEventSource['off'];

	return () => {
		clearTimeout(resizeTimer);
		originalOff('resize', emitDebouncedResize);
		source.on = originalOn as ResizeEventSource['on'];
		source.off = originalOff as ResizeEventSource['off'];
	};
}
