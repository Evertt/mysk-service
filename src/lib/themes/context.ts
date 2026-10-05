import { getContext, setContext } from "svelte";

import type { Slot, SlotProps, SlotStyle, Theme } from "./types.js";

const key = Symbol("theme");

/** Makes a theme available to all components below; `get` is read reactively. */
export function provideTheme(get: () => Theme) {
	setContext(key, get);
}

/**
 * Gives a component access to the current theme's classes. Call it while the component
 * initialises; the returned `classes` can then be used anywhere, e.g. in the markup:
 *
 * ```svelte
 * class={cn("…default classes…", theme.classes("button", { variant, size }), className)}
 * ```
 */
export function useTheme() {
	const get = getContext<(() => Theme) | undefined>(key);
	return {
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
