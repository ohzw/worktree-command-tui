import {EventEmitter} from 'node:events';
import {expect, it, vi} from 'vitest';
import {debounceResizeListeners} from './debounced-resize.js';

it('debounces resize listeners registered through a patched event source', () => {
	vi.useFakeTimers();
	try {
		const source = new EventEmitter();
		const restore = debounceResizeListeners(source, 100);
		const resizeListener = vi.fn();
		source.on('resize', resizeListener);

		source.emit('resize');
		source.emit('resize');
		source.emit('resize');
		vi.advanceTimersByTime(99);
		expect(resizeListener).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(resizeListener).toHaveBeenCalledTimes(1);

		restore();
	} finally {
		vi.useRealTimers();
	}
});

it('restores direct resize delivery when cleanup runs', () => {
	vi.useFakeTimers();
	try {
		const source = new EventEmitter();
		const restore = debounceResizeListeners(source, 100);
		restore();

		const resizeListener = vi.fn();
		source.on('resize', resizeListener);
		source.emit('resize');

		expect(resizeListener).toHaveBeenCalledTimes(1);
	} finally {
		vi.useRealTimers();
	}
});
