import {defaultTheme, extendTheme} from '@inkjs/ui';
import type {TextProps} from 'ink';

type UiVariant = 'info' | 'success' | 'error' | 'warning';

const variantColor: Record<UiVariant, TextProps['color']> = {
	info: 'blue',
	success: 'green',
	error: 'red',
	warning: 'yellow',
};

export const appTheme = extendTheme(defaultTheme, {
	components: {
		StatusMessage: {
			styles: {
				icon: ({variant}: {variant: UiVariant}) => ({
					color: variantColor[variant],
					bold: true,
				}),
			},
		},
		Alert: {
			styles: {
				container: ({variant}: {variant: UiVariant}) => ({
					flexGrow: 0,
					flexShrink: 0,
					borderStyle: 'round',
					borderColor: variantColor[variant],
					gap: 1,
					paddingX: 1,
				}),
				icon: ({variant}: {variant: UiVariant}) => ({
					color: variantColor[variant],
					bold: true,
				}),
				title: () => ({
					bold: true,
				}),
			},
		},

	},
});
