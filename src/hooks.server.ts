import { building } from "$app/env";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { getTextDirection } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { auth } from "#lib/server/auth.ts";
import {
	MODE_COOKIE,
	parseMode,
	parseTheme,
	supportsDark,
	THEME_COOKIE,
} from "#lib/themes/index.ts";

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace("%paraglide.lang%", locale)
						.replace("%paraglide.dir%", getTextDirection(locale)),
			},
		);
	});

/**
 * Renders the chosen theme and mode into the page, so they're right on first paint. The server
 * can't know the system preference: for `system`, a script in `app.html` resolves it before paint.
 */
const handleTheme: Handle = ({ event, resolve }) => {
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	const mode = supportsDark(theme) ? parseMode(event.cookies.get(MODE_COOKIE)) : "light";
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace("%theme%", theme)
				.replace("%mode%", mode)
				.replace("%mode-class%", mode === "dark" ? "dark" : ""),
	});
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleParaglide, handleTheme, handleBetterAuth);
