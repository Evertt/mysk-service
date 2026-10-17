import { error, isHttpError } from "@sveltejs/kit";
import { expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { integrationTenant } from "#lib/server/auth/integrations.ts";
import { guarded, guardedActions, guardedIntegration } from "#lib/server/modules/hooks.ts";

// The guards' session code needs the app's database; these tests don't get that far.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
// An integration endpoint's token is looked up in the database: answered here.
vi.mock("#lib/server/auth/integrations.ts", () => ({ integrationTenant: vi.fn() }));
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

test("an integration endpoint runs as the system in its token's tenant, and not without one", async () => {
	const tenant = { organizationId: "south", name: "South", slug: "south", roles: [], modules: [] };
	vi.mocked(integrationTenant).mockResolvedValueOnce(tenant);
	const handler = guardedIntegration(has, async (event: { request: Request }) => ({
		url: event.request.url,
		tenant: currentTenant().organizationId,
		user: currentTenant().user.id,
	}));
	const request = new Request("http://localhost/widgets/ingest", { method: "POST" });
	expect(await handler({ request })).toEqual({
		url: "http://localhost/widgets/ingest",
		tenant: "south",
		user: "system",
	});
	expect(integrationTenant).toHaveBeenCalledWith(request, has);

	vi.mocked(integrationTenant).mockImplementationOnce(() => error(401, "No token"));
	await expect(handler({ request })).rejects.toMatchObject({ status: 401 });
});
