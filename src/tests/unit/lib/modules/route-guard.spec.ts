import { isHttpError } from "@sveltejs/kit";
import { expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";
import { guardModuleRoute, routeModule } from "#lib/modules/route-guard.ts";

// The tenant has widgets, not gadgets (`ModuleId` only knows the real modules).
const has = "widgets" as ModuleId;
const lacks = "gadgets" as ModuleId;

vi.mock("#lib/auth/session.remote.ts", () => ({ getTenantModules: async () => ["widgets"] }));

const owners = { "/(app)/(modules)/widgets": has, "/(app)/(modules)/gadgets": lacks };

/** The status a call fails with, or `undefined` when it doesn't. */
async function statusOf(call: () => Promise<unknown>) {
	try {
		await call();
	} catch (error) {
		return isHttpError(error) ? error.status : error;
	}
}

test("a route belongs to the module of its route folder", () => {
	expect(routeModule("/(app)/(modules)/widgets", owners)).toBe(has);
	expect(routeModule("/(app)/(modules)/gadgets/[id]/pdf", owners)).toBe(lacks);
	// Neither a longer name that starts with a folder's, nor a route no module owns.
	expect(routeModule("/(app)/(modules)/widgetsx", owners)).toBeUndefined();
	expect(routeModule(null, owners)).toBeUndefined();
});

test("a (modules) group's guard refuses the tenants without the route's module", async () => {
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgets", owners))).toBe(
		undefined,
	);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgets/[id]", owners))).toBe(
		undefined,
	);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/gadgets/[id]", owners))).toBe(404);
	expect(await statusOf(() => guardModuleRoute("/(app)/(modules)/widgetsx", owners))).toBe(404);
	expect(await statusOf(() => guardModuleRoute(null, owners))).toBe(404);
});
