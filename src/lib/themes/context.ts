import { createContext } from "svelte";

import type { Slot, SlotProps, SlotStyle, Theme } from "./types.ts";

const [getTheme, setTheme, hasTheme] = createContext<{
	get: () => Theme;
	isDark: () => boolean;
}>();

/** Makes a theme available to all components below; both getters are read reactively. */
export const provideTheme = (get: () => Theme, isDark: () => boolean) => setTheme({ get, isDark });

/**
 * Gives a component access to the current theme's classes. Call it while the component
 * initialises; the returned `classes` can then be used anywhere, e.g. in the markup:
 *
 * ```svelte
 * class={cn("…default classes…", theme.classes("button", { variant, size }), className)}
 * ```
 */
export function useTheme() {
	const context = hasTheme() ? getTheme() : undefined;
	const get = context?.get;
	return {
		/** Whether dark mode is active (the preference allows it and the theme supports it). */
		get dark() {
			return context?.isDark() ?? false;
		},
		classes<S extends Slot>(slot: S, props: SlotProps<S> = {}) {
			const style = get?.().components?.[slot] as SlotStyle<S> | undefined;
			if (!style) return "";
			const perProp = Object.entries(props).map(([prop, value]) => {
				const classes = style[prop as keyof SlotStyle<S>] as Record<string, string> | undefined;
				return typeof value === "string" ? classes?.[value] : undefined;
			});
			return [style.base, ...perProp].filter(Boolean).join(" ");
		},
	};
}
