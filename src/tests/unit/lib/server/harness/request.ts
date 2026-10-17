/**
 * Runs server code the way a request runs it: as someone (`as(north.owner, work)`), signed out
 * (`signedOut(work)`) or as the system (`asSystem("north", work)`), in SvelteKit's own request
 * store, so `getRequestEvent()` and with it `requireMember()`, `currentTenant()`,
 * `currentEngineer()`, `currentCustomer()`, `inTenant()`, … answer as in the app. `locals` are
 * what `hooks.server.ts` makes of a signed-in request: the user, their session and the tenant
 * (`loadTenant()`, so the organization's modules and order types are the database's). Each
 * request also runs in the visitor's language (Paraglide's middleware) and time zone
 * (`handleTimeZone`, Amsterdam's unless asked: the seed's).
 *
 * Every remote function call (`call()`, `submit()` in `calls.ts`) is a request of its own, as it
 * is over HTTP: the tenant is loaded afresh, and its abort signal fires when it's answered, which
 * ends a live query's watch.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { Cookies, RequestEvent } from "@sveltejs/kit";
import { with_request_store } from "@sveltejs/kit/internal/server";
import { eq } from "drizzle-orm";

import { TIME_ZONE_COOKIE } from "#lib/dates.ts";
import { effectiveModules } from "#lib/modules/graph.ts";
import { nameOrderTypesOnServer } from "#lib/orders/server/types.ts";
import type { Locale } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { asSystem as runAsSystem, loadTenant, type Tenant } from "#lib/server/auth/index.ts";
import { demoOrganizations } from "#lib/server/db/demo.ts";
import { db } from "#lib/server/db/index.ts";
import { organization, organizationModule } from "#lib/server/db/schema.ts";
import { handleTimeZone } from "#lib/server/time-zone.ts";

import { accountOf, type Actor, type Organization } from "./actors.ts";

/** How a visitor's requests are made, besides who they are. */
export interface VisitOptions {
	/** Their language (Paraglide's cookie), English unless asked. */
	locale?: Locale;
	/** Their browser's time zone (the app's cookie), Amsterdam's (the seed's) unless asked. */
	timeZone?: string;
}

interface Visit {
	actor: Actor | null;
	locale: Locale;
	timeZone: string;
	/** Their browser's cookies, which their requests send and may set. */
	cookies: Map<string, string>;
	/** The system's tenant, for `asSystem()`. */
	system?: Tenant;
}

const visits = new AsyncLocalStorage<Visit>();

// The order types read as the request's tenant named them, as `hooks.server.ts` has it.
nameOrderTypesOnServer();

const visitOf = (actor: Actor | null, options: VisitOptions = {}): Visit => ({
	actor,
	locale: options.locale ?? "en",
	timeZone: options.timeZone ?? "Europe/Amsterdam",
	cookies: new Map(),
});

/**
 * Runs `work` as `actor` (e.g. `north.owner`, `south.engineer`), in a request of theirs: what it
 * calls sees them signed in, in their organization, as `hooks.server.ts` would have it. Remote
 * functions called in it (`call()`, `submit()`) are requests of theirs too.
 */
export function as<T>(actor: Actor, work: () => T, options?: VisitOptions): Promise<Awaited<T>> {
	return visits.run(visitOf(actor, options), () => inRequest("GET", {}, async () => await work()));
}

/** Runs `work` in a request of someone who isn't signed in. */
export function signedOut<T>(work: () => T, options?: VisitOptions): Promise<Awaited<T>> {
	return visits.run(visitOf(null, options), () => inRequest("GET", {}, async () => await work()));
}

/**
 * Runs `work` as the system in `organization`, as the daily jobs and the integration endpoints
 * do (`asSystem()` of `#lib/server/auth/system.ts`, with the tenant `runDaily()` makes): no one is
 * signed in, and what's logged is the system's.
 */
export async function asSystem<T>(
	organizationKey: Organization,
	work: () => T,
): Promise<Awaited<T>> {
	const tenant = await systemTenant(organizationKey);
	const visit = { ...visitOf(null), system: tenant };
	return visits.run(visit, () =>
		inRequest("POST", {}, () => runAsSystem(tenant, async () => await work())),
	);
}

/** The tenant of the system in `organizationKey`, as `runDaily()` makes it. */
async function systemTenant(organizationKey: Organization): Promise<Tenant> {
	const { id } = demoOrganizations[organizationKey];
	const [found] = await db.select().from(organization).where(eq(organization.id, id));
	const rows = await db
		.select({ id: organizationModule.moduleId })
		.from(organizationModule)
		.where(eq(organizationModule.organizationId, id));
	return {
		organizationId: id,
		name: found.name,
		slug: found.slug,
		roles: [],
		modules: effectiveModules(rows.map((row) => row.id)),
	};
}

/** What `hooks.server.ts` puts in `locals` for `actor`'s request, or nothing when signed out. */
async function localsOf(actor: Actor | null): Promise<App.Locals> {
	if (!actor) return {};
	const account = await accountOf(actor);
	const organizationId = demoOrganizations[actor.organization].id;
	const tenant = await loadTenant(account.id, organizationId);
	if (tenant?.organizationId !== organizationId) {
		throw new Error(`${actor.email} isn't a member of ${actor.organization}`);
	}
	const now = new Date();
	const session = {
		id: `harness-${account.id}`,
		userId: account.id,
		token: `harness-${account.id}`,
		expiresAt: new Date(now.getTime() + 3_600_000),
		createdAt: now,
		updatedAt: now,
		activeOrganizationId: organizationId,
	};
	return { user: account, session, tenant };
}

/** The flags of SvelteKit's request state a remote function call sets (see `calls.ts`). */
export interface RequestFlags {
	is_in_remote_form_or_command?: boolean;
}

/** SvelteKit's state of a request, as far as the harness reads it. */
export type RequestState = ReturnType<typeof requestState>;

/**
 * Runs `run` in a request of the current visitor (signed out outside `as()`): a request event and
 * state in SvelteKit's request store, inside the hooks that set the language and the time zone.
 * The request is aborted once `run` has answered.
 */
export async function inRequest<T>(
	method: "GET" | "POST",
	flags: RequestFlags,
	run: (event: RequestEvent, state: RequestState) => T,
): Promise<Awaited<T>> {
	const visit = visits.getStore() ?? visitOf(null);
	const locals = visit.system ? {} : await localsOf(visit.actor);
	const controller = new AbortController();
	visit.cookies.set("PARAGLIDE_LOCALE", visit.locale);
	visit.cookies.set(TIME_ZONE_COOKIE, visit.timeZone);
	const request = new Request("http://localhost/", {
		method,
		headers: {
			cookie: [...visit.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
			"accept-language": visit.locale,
		},
		signal: controller.signal,
	});
	const event = requestEvent(request, locals, cookiesOf(visit.cookies));
	const state = { ...requestState(), ...flags };
	try {
		return (await paraglideMiddleware(request, () =>
			handleTimeZone({
				event,
				resolve: () => with_request_store({ event, state }, () => run(event, state)) as never,
			}),
		)) as Awaited<T>;
	} finally {
		controller.abort();
	}
}

/** The visitor's cookies as `event.cookies`, in their jar. */
function cookiesOf(jar: Map<string, string>): Cookies {
	return {
		get: (name) => jar.get(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: (name, value) => void jar.set(name, value),
		delete: (name) => void jar.delete(name),
		serialize: (name, value) => `${name}=${value}`,
		parse: () => {
			throw new Error("A server spec parses no Set-Cookie headers (cookies.parse)");
		},
	};
}

const noSpan = new Proxy({}, { get: () => () => noSpan });

/** A request event as SvelteKit makes it for a remote function call. */
function requestEvent(request: Request, locals: App.Locals, cookies: Cookies): RequestEvent {
	return {
		cookies,
		fetch: () => {
			throw new Error("A server spec makes no requests (event.fetch)");
		},
		getClientAddress: () => "127.0.0.1",
		locals,
		params: {},
		platform: undefined,
		request,
		route: { id: null },
		setHeaders: () => {},
		url: new URL(request.url),
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: true,
		tracing: { enabled: false, root: noSpan, current: noSpan },
	} as unknown as RequestEvent;
}

/** SvelteKit's state of a request (`create_request_state()` in its runtime), as on the server. */
function requestState() {
	return {
		getClientAddress: () => "127.0.0.1",
		platform: undefined,
		read: undefined,
		before_handle: undefined,
		emulator: undefined,
		prerendering: undefined,
		prerender_default: undefined,
		error: false,
		depth: 0,
		rerouted_url: null,
		remote: {
			data: null,
			/** The queries the request refreshed (`refresh()`, `set()`), by `<id>/<payload>`. */
			explicit: null as Map<string, { internals: { name: string } }> | null,
			implicit: null,
			forms: null,
			requested: null,
			ignored: null,
			batches: null,
			live_iterators: null,
		},
		is_in_remote_function: false,
		is_in_remote_form_or_command: false,
		is_in_remote_query: false,
		is_in_remote_prerender: false,
		is_in_render: false,
	};
}
