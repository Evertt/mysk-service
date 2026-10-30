/**
 * What `<ThemeGallery>` draws from `src/lib/themes`: each theme's name, label and the variables it
 * sets in light and in dark mode, as inline style, so a card shows its theme's colours whatever
 * mode the wiki itself is in (inline style beats the `.dark` rules that a dark page would apply to
 * a card meant to be light). The base is the stylesheet's own defaults (`base-variables.ts`: the
 * neutral theme, and the tones and other variables a theme doesn't set), with the theme's `vars`
 * (and in dark, `darkVars`) over it; in dark the base is its dark variables over its light ones.
 */
import { type ThemeName, themeNames, themes } from "#lib/themes/index.ts";
import type { Theme } from "#lib/themes/types.ts";

import { baseVariables } from "./base-variables.ts";

export type GalleryMode = "light" | "dark";

/** The theme's variables for `mode` as an inline `style`. */
export function themeStyle(theme: Theme, mode: GalleryMode): string {
	// Dark over the light base, as the stylesheet layers `.dark` over `:root`: what dark doesn't
	// set (`--font-body`, `--radius`) is the base's, not the page's around the card.
	const vars = {
		...baseVariables.light,
		...(mode === "dark" ? baseVariables.dark : undefined),
		...theme.vars,
		...(mode === "dark" ? theme.darkVars : undefined),
	};
	return Object.entries(vars)
		.map(([property, value]) => `${property}: ${value}`)
		.join("; ");
}

/** A card per theme, in the order the app lists them. */
export const galleryThemes: readonly { name: ThemeName; label: string; theme: Theme }[] =
	themeNames.map((name) => ({ name, label: themes[name].label, theme: themes[name] }));
