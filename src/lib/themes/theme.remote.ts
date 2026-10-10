import { getRequestEvent } from "$app/server";
import * as v from "valibot";

import { forAnyone } from "#lib/server/remote-functions.ts";

import { MODE_COOKIE, modes, parseMode, parseTheme, THEME_COOKIE, themeNames } from "./index.ts";

export const getTheme = forAnyone.query(async () =>
	parseTheme(getRequestEvent().cookies.get(THEME_COOKIE)),
);

const cookieOptions = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;

export const setTheme = forAnyone.command(v.picklist(themeNames), async (theme) => {
	getRequestEvent().cookies.set(THEME_COOKIE, theme, cookieOptions);
	getTheme().set(theme);
});

export const getMode = forAnyone.query(async () =>
	parseMode(getRequestEvent().cookies.get(MODE_COOKIE)),
);

export const setMode = forAnyone.command(v.picklist(modes), async (mode) => {
	getRequestEvent().cookies.set(MODE_COOKIE, mode, cookieOptions);
	getMode().set(mode);
});
