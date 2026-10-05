/**
 * The app's themes. Each one is a set of CSS variables in `routes/layout.css`, selected with a
 * `data-theme` attribute on `<html>` (or on any element, to preview a theme inside it).
 */
export const themes = [
	{ value: "neutral", label: "Neutral" },
	{ value: "blueprint", label: "Blueprint" },
] as const;

export type Theme = (typeof themes)[number]["value"];

export const themeValues = themes.map((theme) => theme.value);

export const THEME_COOKIE = "theme";

/** The theme stored in the cookie, falling back to the first theme. */
export const parseTheme = (value: string | undefined): Theme =>
	themeValues.find((theme) => theme === value) ?? themeValues[0];
