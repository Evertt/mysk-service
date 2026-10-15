import { isHttpError } from "@sveltejs/kit";
import { expect, test, vi } from "vite-plus/test";

import { guardModuleRoute, routeModule } from "#lib/modules/route-guard.ts";

// The tenant has widgets, not gadgets.
vi.mock("#lib/auth/session.remote.ts", () => ({ getTenantModules: async () => ["widgets"] }));

/** The status a call fails with, or `undefined` when it doesn't. */
async function statusOf(call: () => Promise<unknown>) {
	try {
		await call();
	} catch (error) {
		return isHttpError(error) ? error.status : error;
	}
}

test("a route belongs to the module whose folder it is in, in the (modules) group", () => {
	expect(routeModule("/(app)/(modules)/widgets")).toBe("widgets");
	expect(routeModule("/(app)/(modules)/gadgets/[id]/pdf")).toBe("gadgets");
	expect(routeModule("/(field)/(inner)/(modules)/widgets/[id]")).toBe("widgets");
	// Neither a route outside a (modules) group, nor none at all.
	expect(routeModule("/(app)/orders/[number]")).toBeUndefined();
	expect(routeModule("/(app)/(modules)")).toBeUndefined();
	expect(routeModule(null)).toBeUndefined();
});

test("a (modules) group's guard refuses the tenants without the route's module", async () => {
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgets"))).toBe(undefined);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgets/[id]"))).toBe(undefined);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/gadgets/[id]"))).toBe(404);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgetsx"))).toBe(404);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)"))).toBe(404);
	expect(await statusOf(() => guardModuleRoute(null))).toBe(404);
});
