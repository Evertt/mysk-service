/**
 * The guards of the optional modules' routes (see "Modules" in AGENTS.md). The modules' hooks into
 * core server logic are in `#lib/server/extensions.ts`.
 */
import { error } from "@sveltejs/kit";

import type { ModuleId } from "#lib/modules/ids.ts";
import { m } from "#lib/paraglide/messages.js";
import { requireModule } from "#lib/server/auth/index.ts";

/**
 * Refuses the current tenant a module's routes unless it has the module: a 404, as if they didn't
 * exist. The route stubs that `scripts/modules.ts` writes call it through the guards below: the
 * `+layout.server.ts` of each `(modules)` group (`guardModuleRoute()`), so a tenant without the
 * module gets the app's own 404 page inside the app layout, and each server `load`, form action
 * and request handler of a module's route (`guarded()`, `guardedActions()`), which Kit runs
 * without waiting for that layout. No route guards the module's remote functions: they refuse
 * tenants without the module through the set they're made with (`moduleRemote()` in
 * `#lib/server/remote-functions.ts`).
 */
function guardModule(id: ModuleId) {
	requireModule(id);
}

/**
 * The guard of a `(modules)` route group: refuses the tenants without the module that owns the
 * route (`owners`: the route id of each route folder in the group → its module), and every route
 * there that no module owns.
 */
export function guardModuleRoute(
	routeId: string | null,
	owners: Readonly<Record<string, ModuleId>>,
) {
	const folder = Object.keys(owners).find((id) => routeId === id || routeId?.startsWith(`${id}/`));
	if (!folder) error(404, m.common_error_not_found());
	guardModule(owners[folder]);
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
