/**
 * The guard of the optional modules' pages (see "Modules" in AGENTS.md): the universal `+layout.ts`
 * of each `(modules)` route group, which `scripts/modules.ts` writes, calls `guardModuleRoute()`, so
 * a tenant without the module that owns the route gets the app's own 404 page inside the app
 * layout. Universal rather than a server load, so that a client-side navigation to a module's page
 * needs no `__data.json` from the server; on a direct visit it runs on the server, during SSR.
 *
 * It only keeps the pages away. The data is guarded on the server: the module's remote functions by
 * the set they're made with (`moduleRemote()` in `#lib/server/remote-functions.ts`), and its own
 * server files by their stubs (`guarded()`, `guardedActions()` in `#lib/server/modules/hooks.ts`).
 */
import { error } from "@sveltejs/kit";

import { getTenantModules } from "#lib/auth/session.remote.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ModuleId } from "./ids.ts";

/**
 * The module that owns route `routeId` (`owners`: the route id of each route folder in a
 * `(modules)` group → its module), or `undefined` when no module does.
 */
export function routeModule(
	routeId: string | null,
	owners: Readonly<Record<string, ModuleId>>,
): ModuleId | undefined {
	const folder = Object.keys(owners).find((id) => routeId === id || routeId?.startsWith(`${id}/`));
	return folder ? owners[folder] : undefined;
}

/**
 * Refuses the current tenant a `(modules)` group's route with a 404 unless it has the module that
 * owns it (by `owners`, see `routeModule()`); also every route there that no module owns.
 */
export async function guardModuleRoute(
	routeId: string | null,
	owners: Readonly<Record<string, ModuleId>>,
) {
	const owner = routeModule(routeId, owners);
	if (!owner || !(await getTenantModules()).includes(owner)) error(404, m.common_error_not_found());
}
