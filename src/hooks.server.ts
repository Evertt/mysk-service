// First: Temporal, where the runtime has none yet (Node 24), before any other module runs.
import "temporal-polyfill/global";
import { building } from "$app/env";
import { DEV_REMOTE_DELAY_MS } from "$app/env/private";
import { redirect } from "@sveltejs/kit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { isCustomerContact, isFieldEngineer } from "#lib/auth/index.ts";
import { DENSITY_COOKIE, parseDensity } from "#lib/components/data-table/density.svelte.ts";
import { nameOrderTypesOnServer } from "#lib/orders/server/index.ts";
import { m } from "#lib/paraglide/messages.js";
import { getTextDirection } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { auth, loadTenant } from "#lib/server/auth/index.ts";
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
 * their own instead of a session.
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
 * The engineer portal, the only part of the app field engineers use, and the QR codes'
 * links (`/q/<token>`), which lead them into it.
 */
const isPortal = (pathname: string) =>
	pathname === "/my" || pathname.startsWith("/my/") || pathname.startsWith("/q/");

/**
 * The customer portal: the pages of the `(customer)` route group (`/portal`, and the modules' pages
 * there), the only part of the app customers' contacts use. By route id, so a module's page in the
 * group (`/(customer)/(modules)/<id>/…`, under the module's own URL) is part of it too.
 */
const isCustomerPortal = (routeId: string | null) => routeId?.startsWith("/(customer)/") ?? false;

/**
 * Paths of every signed-in role, each with a gate of its own: the bug reports' upload (`/bug-reports`,
 * the office's and the engineer portal's record button) and the developers' pages (`/ops/…`,
 * `forDevelopers`, a 404 for everyone else). The guard leaves them to it.
 */
const isForAnyRole = (pathname: string) =>
	pathname === "/bug-reports" || pathname === "/ops" || pathname.startsWith("/ops/");

/**
 * Sends signed-out visitors to the login page, and signed-in ones away from it; field engineers
 * from the office app to their portal, customers' contacts from everything but the customer portal
 * (and the QR codes' links, which lead them into it) to theirs, and everyone else out of the
 * customer portal. This only guards page requests. Remote function calls pass through (their
 * `event.url` is the calling page's, so a redirect here would be wrong): each is gated by the set
 * it's made with (`forMembers`, `forEngineers`, `forCustomers`, … in
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
		const routeId = event.route.id;
		if (tenant && isCustomerContact(tenant.roles)) {
			const allowed =
				isCustomerPortal(routeId) ||
				pathname.startsWith("/q/") ||
				isPublic(pathname) ||
				isForAnyRole(pathname);
			if (!allowed) redirect(303, "/portal");
		} else if (isCustomerPortal(routeId)) {
			redirect(303, "/");
		}
		const elsewhere = !isPortal(pathname) && !isPublic(pathname) && !isForAnyRole(pathname);
		if (tenant && isFieldEngineer(tenant.roles) && elsewhere) {
			redirect(303, "/my");
		}
	} else if (!isPublic(pathname) && !isIntegration(event.route.id)) {
		const target = pathname + search;
		redirect(303, target === "/" ? "/login" : `/login?redirectTo=${encodeURIComponent(target)}`);
	}

	return resolve(event);
};

// The guard runs after `handleBetterAuth`, which sets `locals.user` and answers /api/auth itself.
export const handle: Handle = sequence(
	delayRemoteCalls,
	handleParaglide,
	handleTimeZone,
	handleTheme,
	blockOrganizationEndpoints,
	handleBetterAuth,
	handleGuard,
);
