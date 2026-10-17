/**
 * The guards of the optional modules' server route files (see docs/agents/modules.md). The
 * modules' hooks into core server logic are in `#lib/server/extensions.ts`.
 */
import type { ModuleId } from "#lib/modules/ids.ts";
import { asSystem, requireModule } from "#lib/server/auth/index.ts";
import { integrationTenant } from "#lib/server/auth/integrations.ts";

/**
 * Refuses the current tenant a module's server code unless it has the module: a 404, as if it
 * didn't exist. The route stubs that `scripts/modules.ts` writes guard each server `load`, form
 * action and request handler of a module's route with it (`guarded()`, `guardedActions()`). The
 * module's pages are kept from tenants without it by the universal `+layout.ts` of each
 * `(modules)` group (`#lib/modules/route-guard.ts`), which doesn't run before those; and no route
 * guards the module's remote functions: they refuse tenants without the module through the set
 * they're made with (`moduleRemote()` in `#lib/server/remote-functions.ts`).
 */
function guardModule(id: ModuleId) {
	requireModule(id);
}

/** A server `load` or request handler of module `id`'s route that refuses tenants without it first. */
export function guarded<Event, Result>(id: ModuleId, handler: (event: Event) => Result) {
	return (event: Event): Result => {
		guardModule(id);
		return handler(event);
	};
}

/** The form actions of module `id`'s page, each refusing tenants without it first. */
export function guardedActions<Actions extends Record<string, (event: never) => unknown>>(
	id: ModuleId,
	actions: Actions,
): Actions {
	return Object.fromEntries(
		Object.entries(actions).map(([name, action]) => [name, guarded(id, action)]),
	) as Actions;
}

/**
 * A request handler of module `id`'s integration endpoint (a `+server.ts` in its `(api)` routes):
 * no session, but a token of the module's (`Authorization: Bearer …`, see
 * `#lib/server/auth/integrations.ts`), which says whose data it is. Refuses a missing, unknown or
 * revoked token (401) and a tenant without the module (404) before it runs, and runs it as the
 * system in the token's tenant (`asSystem()`): its queries, transactions and log entries work as
 * in a member's request.
 */
export function guardedIntegration<Event extends { request: Request }, Result>(
	id: ModuleId,
	handler: (event: Event) => Result,
) {
	return async (event: Event): Promise<Awaited<Result>> => {
		const tenant = await integrationTenant(event.request, id);
		return await asSystem(tenant, () => handler(event));
	};
}
