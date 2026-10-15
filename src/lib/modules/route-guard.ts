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

/**
 * The module that owns route `routeId`: the folder right after its `(modules)` group, which the
 * generator names after the module (`/(app)/(modules)/contracts/[number]` → `contracts`); or
 * `undefined` for a route outside a `(modules)` group.
 */
export function routeModule(routeId: string | null): string | undefined {
	const segments = routeId?.split("/") ?? [];
	const group = segments.indexOf("(modules)");
	return group === -1 ? undefined : segments[group + 1];
}

/**
 * Refuses the current tenant a `(modules)` group's route with a 404 unless it has the module that
 * owns it (see `routeModule()`).
 */
export async function guardModuleRoute(routeId: string | null) {
	const owner = routeModule(routeId);
	if (!owner || !(await getTenantModules()).some((id) => id === owner)) {
		error(404, m.common_error_not_found());
	}
}
