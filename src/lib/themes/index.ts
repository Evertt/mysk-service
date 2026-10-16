import blueprint from "./blueprint.ts";
import brutalist from "./brutalist.ts";
import harbor from "./harbor.ts";
import lagoon from "./lagoon.ts";
import neutral from "./neutral.ts";
import sorbet from "./sorbet.ts";
import type { Theme } from "./types.ts";

/**
 * The app's themes. Each one is a single file with CSS variables (colours, radius, font) and
 * Tailwind classes per component part. To add one, create the file and register it here.
 */
export const themes = { neutral, harbor, lagoon, blueprint, brutalist, sorbet } satisfies Record<
	string,
	Theme
>;

export type ThemeName = keyof typeof themes;

export const themeNames = Object.keys(themes) as [ThemeName, ...ThemeName[]];

export const THEME_COOKIE = "theme";

/** The theme of whoever hasn't chosen one. */
export const DEFAULT_THEME: ThemeName = "harbor";

/** The theme stored in the cookie, falling back to the default. */
export const parseTheme = (value: string | undefined): ThemeName =>
	themeNames.find((name) => name === value) ?? DEFAULT_THEME;

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
			`:root.dark[data-theme="${name}"], .dark [data-theme="${name}"] { ${declarations(theme.darkVars)} }`,
	])
	.filter(Boolean)
	.join("\n");
