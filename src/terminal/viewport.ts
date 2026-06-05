export type ViewportSlice<T> = {
	visibleItems: T[];
	startIndex: number;
	viewportHeight: number;
	scrollOffset: number;
	maxScrollOffset: number;
};

export type TailViewportSlice<T> = ViewportSlice<T> & {
	topScrollOffset: number;
};

export function normalizeViewportHeight(viewportHeight: number): number {
	return Math.max(1, Math.trunc(viewportHeight));
}

export function clampScrollOffset(totalItems: number, viewportHeight: number, scrollOffset: number): number {
	const normalizedViewportHeight = normalizeViewportHeight(viewportHeight);
	const maxScrollOffset = Math.max(0, totalItems - normalizedViewportHeight);
	return Math.min(Math.max(Math.trunc(scrollOffset), 0), maxScrollOffset);
}

export function sliceListViewport<T>(items: readonly T[], viewportHeight: number, scrollOffset: number): ViewportSlice<T> {
	const normalizedViewportHeight = normalizeViewportHeight(viewportHeight);
	const maxScrollOffset = Math.max(0, items.length - normalizedViewportHeight);
	const effectiveScrollOffset = Math.min(Math.max(Math.trunc(scrollOffset), 0), maxScrollOffset);
	return {
		visibleItems: items.slice(effectiveScrollOffset, effectiveScrollOffset + normalizedViewportHeight),
		startIndex: effectiveScrollOffset,
		viewportHeight: normalizedViewportHeight,
		scrollOffset: effectiveScrollOffset,
		maxScrollOffset,
	};
}

export function sliceTailViewport<T>(items: readonly T[], viewportHeight: number, scrollOffset: number): TailViewportSlice<T> {
	const normalizedViewportHeight = normalizeViewportHeight(viewportHeight);
	const maxScrollOffset = Math.max(0, items.length - normalizedViewportHeight);
	const effectiveScrollOffset = Math.min(Math.max(Math.trunc(scrollOffset), 0), maxScrollOffset);
	const topScrollOffset = maxScrollOffset - effectiveScrollOffset;
	return {
		visibleItems: items.slice(topScrollOffset, topScrollOffset + normalizedViewportHeight),
		startIndex: topScrollOffset,
		viewportHeight: normalizedViewportHeight,
		scrollOffset: effectiveScrollOffset,
		maxScrollOffset,
		topScrollOffset,
	};
}

export function getScrollbarThumbRows(totalLines: number, viewportHeight: number, scrollOffset: number): Set<number> {
	const normalizedViewportHeight = normalizeViewportHeight(viewportHeight);
	if (totalLines <= normalizedViewportHeight) {
		return new Set();
	}

	const thumbSize = Math.max(1, Math.floor((normalizedViewportHeight / totalLines) * normalizedViewportHeight));
	const maxScrollOffset = Math.max(1, totalLines - normalizedViewportHeight);
	const effectiveScrollOffset = Math.min(Math.max(Math.trunc(scrollOffset), 0), maxScrollOffset);
	const thumbStart = Math.round((effectiveScrollOffset / maxScrollOffset) * (normalizedViewportHeight - thumbSize));
	const rows = new Set<number>();
	for (let index = 0; index < thumbSize; index += 1) {
		rows.add(thumbStart + index);
	}
	return rows;
}
