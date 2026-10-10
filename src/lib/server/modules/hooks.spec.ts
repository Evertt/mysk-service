import { isHttpError } from "@sveltejs/kit";
import { expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";

import { guarded, guardedActions, guardModuleRoute } from "./hooks.ts";

// The guards' session code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({
	getRequestEvent: () => ({
		locals: {
			user: { id: "u1" },
			tenant: { organizationId: "north", roles: ["member"], modules: ["widgets"] },
		},
	}),
}));

/** The status a call fails with, or `undefined` when it doesn't. */
function statusOf(call: () => unknown) {
	try {
		call();
	} catch (error) {
		return isHttpError(error) ? error.status : error;
	}
}

// The tenant has widgets, not gadgets (`ModuleId` only knows the real modules).
const has = "widgets" as ModuleId;
const lacks = "gadgets" as ModuleId;

test("a (modules) group's guard refuses the tenants without the route's module", () => {
	const owners = { "/(app)/(modules)/widgets": has, "/(app)/(modules)/gadgets": lacks };
	expect(statusOf(() => guardModuleRoute("/(app)/(modules)/widgets", owners))).toBeUndefined();
	expect(statusOf(() => guardModuleRoute("/(app)/(modules)/widgets/[id]", owners))).toBeUndefined();
	expect(statusOf(() => guardModuleRoute("/(app)/(modules)/gadgets/[id]", owners))).toBe(404);
	// Neither a longer name that starts with a folder's, nor a route no module owns.
	expect(statusOf(() => guardModuleRoute("/(app)/(modules)/widgetsx", owners))).toBe(404);
	expect(statusOf(() => guardModuleRoute(null, owners))).toBe(404);
});

test("a module route's loads, handlers and actions refuse the tenants without it first", () => {
	const ran: string[] = [];
	const handler = (event: string) => ran.push(event);
	expect(guarded(has, handler)("load")).toBe(1);
	expect(statusOf(() => guarded(lacks, handler)("GET"))).toBe(404);

	const actions = { default: handler, save: handler };
	expect(Object.keys(guardedActions(lacks, actions))).toEqual(["default", "save"]);
	expect(statusOf(() => guardedActions(lacks, actions).save("save"))).toBe(404);
	guardedActions(has, actions).default("default");
	expect(ran).toEqual(["load", "default"]);
});
