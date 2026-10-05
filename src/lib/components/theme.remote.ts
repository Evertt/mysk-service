import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";

import { parseTheme, THEME_COOKIE, themeValues } from "#lib/themes.js";

export const getTheme = query(async () => parseTheme(getRequestEvent().cookies.get(THEME_COOKIE)));

export const setTheme = command(v.picklist(themeValues), async (theme) => {
	getRequestEvent().cookies.set(THEME_COOKIE, theme, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax",
	});
	getTheme().set(theme);
});
