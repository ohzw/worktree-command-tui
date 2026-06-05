import {describe, expect, it} from 'vitest';
import {getScrollbarThumbRows, sliceListViewport, sliceTailViewport} from './viewport.js';

describe('sliceListViewport', () => {
	it('clamps negative and oversized scroll offsets before slicing from the top', () => {
		const rows = ['a', 'b', 'c', 'd', 'e'];

		expect(sliceListViewport(rows, 3, -4)).toMatchObject({
			visibleItems: ['a', 'b', 'c'],
			startIndex: 0,
			scrollOffset: 0,
			maxScrollOffset: 2,
			viewportHeight: 3,
		});
		expect(sliceListViewport(rows, 3, 99)).toMatchObject({
			visibleItems: ['c', 'd', 'e'],
			startIndex: 2,
			scrollOffset: 2,
			maxScrollOffset: 2,
			viewportHeight: 3,
		});
	});

	it('treats non-positive viewport heights as one visible row', () => {
		expect(sliceListViewport(['a', 'b'], 0, 1)).toMatchObject({
			visibleItems: ['b'],
			startIndex: 1,
			scrollOffset: 1,
			maxScrollOffset: 1,
			viewportHeight: 1,
		});
	});
});

describe('sliceTailViewport', () => {
	it('uses scroll offset as distance from the newest tail rows', () => {
		const rows = ['a', 'b', 'c', 'd', 'e'];

		expect(sliceTailViewport(rows, 3, 0)).toMatchObject({
			visibleItems: ['c', 'd', 'e'],
			startIndex: 2,
			scrollOffset: 0,
			topScrollOffset: 2,
			maxScrollOffset: 2,
			viewportHeight: 3,
		});
		expect(sliceTailViewport(rows, 3, 1)).toMatchObject({
			visibleItems: ['b', 'c', 'd'],
			startIndex: 1,
			scrollOffset: 1,
			topScrollOffset: 1,
			maxScrollOffset: 2,
			viewportHeight: 3,
		});
	});

	it('clamps tail distance at the oldest visible rows', () => {
		expect(sliceTailViewport(['a', 'b', 'c'], 2, 9)).toMatchObject({
			visibleItems: ['a', 'b'],
			startIndex: 0,
			scrollOffset: 1,
			topScrollOffset: 0,
			maxScrollOffset: 1,
		});
	});
});

describe('getScrollbarThumbRows', () => {
	it('returns thumb rows for the supplied top-based scroll offset', () => {
		expect([...getScrollbarThumbRows(10, 4, 0)]).toEqual([0]);
		expect([...getScrollbarThumbRows(10, 4, 3)]).toEqual([2]);
		expect([...getScrollbarThumbRows(10, 4, 6)]).toEqual([3]);
	});

	it('returns no thumb when all rows fit', () => {
		expect([...getScrollbarThumbRows(3, 4, 0)]).toEqual([]);
	});
});
