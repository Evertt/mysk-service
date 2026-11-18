/**
 * The customer portal's pages of the tenant's modules (`portal` in `#lib/modules/manifests.ts`), in
 * registry order, which its "More" tab lists (`portal/more/+page.svelte`) and marks (`tab-bar.svelte`).
 */
import { type AppModule, modulePages, modules } from "#lib/modules/manifests.ts";

/** The modules of `tenantModules` with a page in the portal, each with its route and entry. */
export const portalModulePages = (tenantModules: readonly string[]) =>
	(modules as readonly AppModule[]).flatMap((module) => {
		const route = modulePages[module.id].portal;
		return route && module.portal && tenantModules.includes(module.id)
			? [{ id: module.id, route, ...module.portal }]
			: [];
	});
