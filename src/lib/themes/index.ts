import blueprint from "./blueprint.js";
import brutalist from "./brutalist.js";
import harbor from "./harbor.js";
import neutral from "./neutral.js";
import sorbet from "./sorbet.js";
import type { Theme } from "./types.js";

/**
 * The app's themes. Each one is a single file with CSS variables (colours, radius, font) and
 * Tailwind classes per component part. To add one, create the file and register it here.
 */
export const themes = { neutral, harbor, blueprint, brutalist, sorbet } satisfies Record<
	string,
	Theme
>;

export type ThemeName = keyof typeof themes;

export const themeNames = Object.keys(themes) as [ThemeName, ...ThemeName[]];

export const THEME_COOKIE = "theme";

/** The theme stored in the cookie, falling back to the first theme. */
export const parseTheme = (value: string | undefined): ThemeName =>
	themeNames.find((name) => name === value) ?? themeNames[0];

export const supportsDark = (name: ThemeName) => (themes[name] as Theme).darkVars !== undefined;

/** The light/dark mode preference; `system` follows the operating system. */
export const modes = ["light", "dark", "system"] as const;

export type Mode = (typeof modes)[number];

export const MODE_COOKIE = "mode";

export const parseMode = (value: string | undefined): Mode =>
	modes.find((mode) => mode === value) ?? "system";

const declarations = (vars: Record<string, string>) =>
	Object.entries(vars)
		.map(([property, value]) => `${property}: ${value};`)
		.join(" ");

/**
 * Every theme's variables as CSS. Each theme is scoped to `[data-theme]`, so any element can
 * preview a theme (like the switcher's swatches); `:root` raises specificity so the page's theme
 * wins over the defaults in `layout.css`. Dark variables apply under the `.dark` class.
 */
export const themeStylesheet = Object.entries(themes as Record<ThemeName, Theme>)
	.flatMap(([name, theme]) => [
		theme.vars &&
			`:root[data-theme="${name}"], [data-theme="${name}"] { ${declarations(theme.vars)} }`,
		theme.darkVars &&
			Object.keys(theme.darkVars).length > 0 &&
			`:root.dark[data-theme="${name}"], .dark [data-theme="${name}"] { ${declarations(theme.darkVars)} }`,
	])
	.filter(Boolean)
	.join("\n");
