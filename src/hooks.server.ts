import { building } from "$app/env";
import { redirect } from "@sveltejs/kit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { isFieldEngineer } from "#lib/auth/index.ts";
import { DENSITY_COOKIE, parseDensity } from "#lib/components/data-table/density.svelte.ts";
import { getTextDirection } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { auth, loadTenant } from "#lib/server/auth/index.ts";
import { MODE_COOKIE, parseMode, parseTheme, THEME_COOKIE } from "#lib/themes/index.ts";

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
 * Renders the chosen theme and mode, and the data tables' density, into the page, so they're right
 * on first paint. The server can't know the system preference: for `system`, a script in
 * `app.html` resolves it before paint.
 */
const handleTheme: Handle = ({ event, resolve }) => {
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	const mode = parseMode(event.cookies.get(MODE_COOKIE));
	const density = parseDensity(event.cookies.get(DENSITY_COOKIE));
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace("%theme%", theme)
				.replace("%mode%", mode)
				.replace("%mode-class%", mode === "dark" ? "dark" : "")
				.replace("%table-density%", density),
	});
};

/**
 * The app manages organizations through its own server code (`auth.api.*`), so better-auth's
 * organization endpoints aren't exposed over HTTP: otherwise an owner could, say, delete their
 * organization (and with it all its data) or change members outside the app.
 */
const blockOrganizationEndpoints: Handle = ({ event, resolve }) => {
	if (event.url.pathname.startsWith("/api/auth/organization/")) {
		return new Response("Not found", { status: 404 });
	}
	return resolve(event);
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		event.locals.tenant = await loadTenant(
			session.user.id,
			(session.session as { activeOrganizationId?: string | null }).activeOrganizationId,
		);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Paths anyone may open: the login page, invitations (`/invite/[id]`), better-auth's endpoints and
 * SvelteKit's own assets.
 */
const isPublic = (pathname: string) =>
	pathname === "/login" ||
	pathname.startsWith("/invite/") ||
	pathname.startsWith("/api/auth/") ||
	pathname.startsWith("/_app/");

/** The engineer portal, the only part of the app field engineers use. */
const isPortal = (pathname: string) => pathname === "/my" || pathname.startsWith("/my/");

/**
 * Sends signed-out visitors to the login page, and signed-in ones away from it; field engineers
 * from the office app to their portal. This only guards page requests. Remote function calls pass
 * through (their `event.url` is the calling page's, so a redirect here would be wrong): each is
 * gated by the set it's made with (`forMembers`, `forEngineers`, … in
 * `#lib/server/remote-functions.ts`).
 */
const handleGuard: Handle = ({ event, resolve }) => {
	if (event.isRemoteRequest) return resolve(event);

	const { pathname, search } = event.url;
	if (event.locals.user) {
		if (pathname === "/login" && event.request.method === "GET") {
			redirect(303, "/");
		}
		const { tenant } = event.locals;
		if (tenant && isFieldEngineer(tenant.roles) && !isPortal(pathname) && !isPublic(pathname)) {
			redirect(303, "/my");
		}
	} else if (!isPublic(pathname)) {
		const target = pathname + search;
		redirect(303, target === "/" ? "/login" : `/login?redirectTo=${encodeURIComponent(target)}`);
	}

	return resolve(event);
};

// The guard runs after `handleBetterAuth`, which sets `locals.user` and answers /api/auth itself.
export const handle: Handle = sequence(
	handleParaglide,
	handleTheme,
	blockOrganizationEndpoints,
	handleBetterAuth,
	handleGuard,
);
