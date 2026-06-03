import type {RenderOptions} from 'ink';

export const APP_RENDER_OPTIONS = {
	alternateScreen: true,
	exitOnCtrlC: true,
	incrementalRendering: true,
} as const satisfies RenderOptions;
