// First: Temporal, where the runtime has none yet (Node 24), before any other module runs.
import "temporal-polyfill/global";
import { building } from "$app/env";
import { DEV_REMOTE_DELAY_MS } from "$app/env/private";
import { redirect } from "@sveltejs/kit";
import { type Handle, type HandleServerError, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { loginUrl, shellOf } from "#lib/auth/index.ts";
import { DENSITY_COOKIE, parseDensity } from "#lib/components/data-table/density.svelte.ts";
import { nameOrderTypesOnServer } from "#lib/orders/server/index.ts";
import { m } from "#lib/paraglide/messages.js";
import { getTextDirection } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { auth, loadTenant } from "#lib/server/auth/index.ts";
import { logServerError } from "#lib/server/logs/log.ts";
import { handleTiming } from "#lib/server/logs/timing.ts";
import { handleTimeZone } from "#lib/server/time-zone.ts";
import { MODE_COOKIE, parseMode, parseTheme, THEME_COOKIE } from "#lib/themes/index.ts";

import { deferStylesheets } from "./routes/splash.ts";

// The order types read as the request's tenant named them, wherever the server shows one.
nameOrderTypesOnServer();

/**
 * With `DEV_REMOTE_DELAY_MS` set, holds up each remote function call (and each page's server data,
 * `__data.json`, which a module's pages have) that long: a slow server, to try what navigations do
 * while they wait (an experiment, see "Skeletons" in `docs/agents/modules.md`). Also in a production build (`vp preview`), to
 * measure the service worker (`scripts/sw-benchmark.ts`).
 */
const delayRemoteCalls: Handle = async ({ event, resolve }) => {
	// The request's own URL: a remote call's `event.url` is the calling page's.
	const { pathname } = new URL(event.request.url);
	const slow = pathname.includes("/_app/remote") || pathname.endsWith("/__data.json");
	if (DEV_REMOTE_DELAY_MS && slow) {
		await new Promise((done) => setTimeout(done, DEV_REMOTE_DELAY_MS));
	}
	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					deferStylesheets(html)
						.replace("%paraglide.lang%", locale)
						.replace("%paraglide.dir%", getTextDirection(locale))
						// The splash screen's text for screen readers (`app.html`), before any script runs.
						.replace("%splash.label%", m.common_app_loading({}, { locale })),
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
 * Paths anyone may open: the login page, invitations (`/invite/[id]`), better-auth's endpoints,
 * SvelteKit's own assets, and the operations endpoints (`/_ops/daily`), which check a token of
 * their own instead of a session. By path, as some have no route.
 */
const isPublic = (pathname: string) =>
	pathname === "/login" ||
	pathname.startsWith("/invite/") ||
	pathname.startsWith("/api/auth/") ||
	pathname.startsWith("/_app/") ||
	pathname.startsWith("/_ops/");

/**
 * The modules' integration endpoints (their `(api)` routes, e.g. the docks' Salvo feed at
 * `/docks/ingest`): systems outside the app post to them with a token of the module's instead of a
 * session, which their route stubs check (`guardedIntegration()`, `#lib/server/modules/hooks.ts`).
 */
const isIntegration = (routeId: string | null) => routeId?.startsWith("/(api)/") ?? false;

/**
 * Pages of every signed-in role, each with a gate of its own: the bug reports' upload (`/bug-reports`,
 * the office's and the engineer portal's record button) and the developers' pages (`/ops/…`,
 * `forDevelopers`, a 404 for everyone else). The guard leaves them to it.
 */
const isForAnyRole = (routeId: string | null) =>
	routeId === "/bug-reports" || (routeId?.startsWith("/(ops)/") ?? false);

/**
 * Sends signed-out visitors to the login page, and signed-in ones away from it; and everyone from
 * a page that isn't their shell's (`shellOf()`, `#lib/auth/shells.ts`) to its home: field
 * engineers from the office app to their portal, customers' contacts from everything but the
 * customer portal (and the QR codes' links, which lead them into it) to theirs, and everyone else
 * out of the customer portal. This only guards page requests, as the browser loads a page in full.
 * After a client-side navigation (such as the one after signing in, to whichever page the login
 * page leads back to), the office shell sends engineers and contacts home itself
 * (`getCurrentTenant`), and the portals' gates refuse whoever isn't theirs. Remote function calls
 * pass through (their `event.url` is the calling page's, so a redirect here would be wrong): each
 * is gated by the set it's made with (`forMembers`, `forEngineers`, `forCustomers`, … in
 * `#lib/server/remote-functions.ts`).
 */
const handleGuard: Handle = ({ event, resolve }) => {
	if (event.isRemoteRequest) return resolve(event);

	const { pathname, search } = event.url;
	const routeId = event.route.id;
	if (event.locals.user) {
		if (pathname === "/login" && event.request.method === "GET") {
			redirect(303, "/");
		}
		if (!isPublic(pathname) && !isForAnyRole(routeId)) {
			const shell = shellOf(event.locals.tenant?.roles ?? []);
			if (!shell.owns(routeId)) redirect(303, shell.home);
		}
	} else if (!isPublic(pathname) && !isIntegration(routeId)) {
		redirect(303, loginUrl(pathname + search));
	}

	return resolve(event);
};

// The guard runs after `handleBetterAuth`, which sets `locals.user` and answers /api/auth itself.
// The timing first, so that its line covers the whole request.
export const handle: Handle = sequence(
	handleTiming,
	delayRemoteCalls,
	handleParaglide,
	handleTimeZone,
	handleTheme,
	blockOrganizationEndpoints,
	handleBetterAuth,
	handleGuard,
);

/**
 * Every error the server catches gets an id, which the error pages show for quoting
 * (`App.Error.errorId`). Those that are bugs (unknown errors, and any 5xx) are logged as one
 * structured line with it (`#lib/server/logs/log.ts`), which Workers Logs finds by `errorId`. The
 * refusals (`error(404)`, a 403, a remote function's invalid argument) aren't: they're the app
 * working. An unknown error's message stays SvelteKit's generic one.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	const errorId = crypto.randomUUID();
	const status = kind === "unknown" ? 500 : error.status;
	if (status >= 500) logServerError(event, { errorId, status, error });
	return { errorId };
};
