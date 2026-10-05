import blueprint from "./blueprint.js";
import brutalist from "./brutalist.js";
import neutral from "./neutral.js";
import type { Theme } from "./types.js";

/**
 * The app's themes. Each one is a single file with CSS variables (colours, radius, font) and
 * Tailwind classes per component part. To add one, create the file and register it here.
 */
export const themes = { neutral, blueprint, brutalist } satisfies Record<string, Theme>;

export type ThemeName = keyof typeof themes;

export const themeNames = Object.keys(themes) as [ThemeName, ...ThemeName[]];

export const THEME_COOKIE = "theme";

/** The theme stored in the cookie, falling back to the first theme. */
export const parseTheme = (value: string | undefined): ThemeName =>
	themeNames.find((name) => name === value) ?? themeNames[0];

/**
 * Every theme's variables as CSS. Each theme is scoped to `[data-theme]`, so any element can
 * preview a theme (like the switcher's swatches); `:root` raises specificity so the page's theme
 * wins over the defaults in `layout.css`.
 */
export const themeStylesheet = Object.entries(themes as Record<ThemeName, Theme>)
	.filter(([, theme]) => theme.vars)
	.map(([name, theme]) => {
		const declarations = Object.entries(theme.vars ?? {})
			.map(([property, value]) => `${property}: ${value};`)
			.join(" ");
		return `:root[data-theme="${name}"], [data-theme="${name}"] { ${declarations} }`;
	})
	.join("\n");
