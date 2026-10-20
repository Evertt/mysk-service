/**
 * The gates, for every module and every remote function: a tenant without an optional module gets
 * a 404 from each of the module's remote functions and server routes, before their handlers run,
 * as if the module weren't there; and the core's gated sets refuse whoever they aren't for (one
 * remote function per set). Found by globs, so a new module, remote function or route is covered
 * without a change here. A module's e2e tests only check its pages and sidebar for such a tenant.
 *
 * The remote functions are made by stand-ins (`stand-ins.ts`), so they're called without
 * SvelteKit's schema validation: the gate sees whatever it's sent, here an argument the handler
 * can't touch. A gate refuses synchronously, so a call that throws at once didn't start the
 * handler; and as SHLTR, which has every module, the same call gets past the module's check.
 */
import { isHttpError } from "@sveltejs/kit";
import { describe, expect, test, vi } from "vite-plus/test";

import { moduleIds } from "#lib/modules/ids.ts";
import { issueIntegrationToken } from "#lib/server/auth/integrations.ts";
import {
	as,
	asSystem,
	north,
	shltr,
	signedOut,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";
import { gatedHandler, isStandIn } from "#unit/lib/server/harness/stand-ins.ts";

vi.mock("$app/server", async (importOriginal) => ({
	...(await importOriginal<object>()),
	...(await import("#unit/lib/server/harness/stand-ins.ts")).remoteStandIns,
}));

/** The modules' remote function files, and the route files the generator links into the app. */
const moduleRemoteFiles = import.meta.glob("/src/modules/*/**/*.remote.ts");
const serverRouteFiles = import.meta.glob("/src/routes/**/+{server,page.server,layout.server}.ts");

/** The module that owns a file in `src/modules/<id>/`, or a route in a `(modules)/<id>/` group. */
const moduleOfFile = (path: string) => path.split("/")[3];
const moduleOfRoute = (path: string) => path.split("/(modules)/")[1]?.split("/")[0];

/** The remote functions of `id`'s files, by `<file>: <export>`. */
async function moduleRemotes(id: string) {
	const files = Object.entries(moduleRemoteFiles).filter(([path]) => moduleOfFile(path) === id);
	const remotes: [string, unknown][] = [];
	for (const [path, load] of files) {
		const exports = (await load()) as Record<string, unknown>;
		for (const [name, remote] of Object.entries(exports)) {
			remotes.push([`${path.split("/").at(-1)}: ${name}`, remote]);
		}
	}
	return remotes;
}

/** An argument (and a form's `issue`) that notes when the handler reads it, and fails it. */
function untouchable() {
	const seen = { touched: false };
	const touch = () => {
		seen.touched = true;
		throw new Error("The handler ran");
	};
	const value = new Proxy(() => {}, { get: touch, has: touch, ownKeys: touch, apply: touch });
	return { value, seen };
}

/** How `run` refused: synchronously or not, with the HTTP status (or what else it threw). */
async function refusal(run: () => unknown) {
	let result: unknown;
	try {
		result = run();
	} catch (thrown) {
		return { at: "once", status: isHttpError(thrown) ? thrown.status : String(thrown) };
	}
	try {
		await result;
		return { at: "never" };
	} catch (thrown) {
		return { at: "later", status: isHttpError(thrown) ? thrown.status : String(thrown) };
	}
}

describe.each(moduleIds)("%s, for a tenant without it", (id) => {
	test("each of its remote functions is a 404, before its handler runs", async () => {
		const remotes = await moduleRemotes(id);
		expect(remotes.length).toBeGreaterThan(0);
		await withoutModule("north", id, () =>
			as(north.owner, async () => {
				for (const [name, remote] of remotes) {
					expect(isStandIn(remote), name).toBe(true);
					const { value, seen } = untouchable();
					const refused = await refusal(() => gatedHandler(remote)(value, value));
					expect({ name, ...refused, touched: seen.touched }).toEqual({
						name,
						at: "once",
						status: 404,
						touched: false,
					});
				}
			}),
		);
		// With the module, the same calls are past its check (into the handler, or a role's gate).
		await as(shltr.owner, async () => {
			for (const [name, remote] of remotes) {
				const { value } = untouchable();
				const passed = await refusal(() => gatedHandler(remote)(value, value));
				expect({ name, ...passed }).not.toEqual({ name, at: "once", status: 404 });
			}
		});
	});

	// Most modules have none: their pages read through remote functions.
	const routes = Object.entries(serverRouteFiles).filter(([path]) => moduleOfRoute(path) === id);
	if (!routes.length) return;
	test("each of its server routes is a 404, before its handler runs", async () => {
		for (const [path, load] of routes) {
			const exports = (await load()) as Record<string, unknown>;
			// Its request handlers (`GET`, …) and `load`, and each of its form `actions`.
			const handlers: [string, unknown][] = Object.entries(exports).flatMap(
				([name, exported]): [string, unknown][] =>
					name === "actions"
						? Object.entries(exported as Record<string, unknown>).map(([action, handler]) => [
								`actions.${action}`,
								handler,
							])
						: typeof exported === "function"
							? [[name, exported]]
							: [],
			);
			expect(handlers.length, path).toBeGreaterThan(0);
			for (const [name, handler] of handlers) {
				const run = handler as (event: unknown) => unknown;
				const where = `${path}: ${name}`;
				if (path.includes("/(api)/")) {
					// An integration endpoint: no session, but a token of the module's, of a tenant
					// without it (made as the system, which doesn't check), or none.
					const { token } = await asSystem("north", () =>
						issueIntegrationToken(id as never, "Gate"),
					);
					const event = (authorization?: string) => ({
						request: new Request("http://localhost/", {
							method: "POST",
							headers: authorization ? { authorization } : {},
							body: "{}",
						}),
					});
					await withoutModule("north", id, async () => {
						expect({ where, ...(await refusal(() => run(event(`Bearer ${token}`)))) }).toEqual({
							where,
							at: "later",
							status: 404,
						});
						expect({ where, ...(await refusal(() => run(event()))) }).toEqual({
							where,
							at: "later",
							status: 401,
						});
					});
				} else {
					await withoutModule("north", id, () =>
						as(north.owner, async () => {
							const event = { params: {}, url: new URL("http://localhost/"), locals: {} };
							expect({ where, ...(await refusal(() => run(event))) }).toEqual({
								where,
								at: "once",
								status: 404,
							});
						}),
					);
				}
			}
		}
	});
});

test("every module's files are found", () => {
	const owners = new Set(Object.keys(moduleRemoteFiles).map(moduleOfFile));
	expect([...owners].sort()).toEqual([...moduleIds].sort());
	const routeOwners = Object.keys(serverRouteFiles).flatMap((path) => moduleOfRoute(path) ?? []);
	expect(routeOwners.length).toBeGreaterThan(0);
	for (const owner of routeOwners) expect(moduleIds).toContain(owner);
});

describe("the core's gated sets refuse whoever they aren't for", () => {
	const call = async (remote: unknown, arg?: unknown) => {
		const { value } = untouchable();
		return (await refusal(() => gatedHandler(remote)(arg ?? value, value))).status;
	};

	test("forMembers: the engineers and the customers' contacts", async () => {
		const { getOrder } = await import("#lib/orders/order.remote.ts");
		expect(await as(north.engineer, () => call(getOrder))).toBe(403);
		expect(await as(north.customer, () => call(getOrder))).toBe(403);
		expect(await signedOut(() => call(getOrder))).toBe(401);
	});

	test("forManagers: a member who's no owner or admin", async () => {
		const { getCategorySettings } = await import("#lib/equipment/categories/categories.remote.ts");
		expect(await as(north.member, () => call(getCategorySettings))).toBe(403);
		expect(await as(north.engineer, () => call(getCategorySettings))).toBe(403);
	});

	test("forEngineers: anyone not linked to an engineer", async () => {
		const { getMyWork } = await import("#routes/(field)/my/portal.remote.ts");
		expect(await as(north.owner, () => call(getMyWork))).toBe(403);
		expect(await as(north.customer, () => call(getMyWork))).toBe(403);
	});

	test("forCustomers: anyone who's no customer's contact", async () => {
		const { getPortalHome } = await import("#routes/(customer)/portal/client.remote.ts");
		expect(await as(north.owner, () => call(getPortalHome))).toBe(403);
		expect(await as(north.engineer, () => call(getPortalHome))).toBe(403);
	});

	test("forAnyRole and forUsers: whoever isn't signed in", async () => {
		const { getTenantModules, switchOrganization } = await import("#lib/auth/session.remote.ts");
		expect(await signedOut(() => call(getTenantModules))).toBe(401);
		expect(await signedOut(() => call(switchOrganization))).toBe(401);
		// And the system, as in the daily jobs, isn't refused either.
		expect(await asSystem("north", () => call(getTenantModules))).toBeUndefined();
	});

	test("forAnyone: no one", async () => {
		const { getTheme } = await import("#lib/themes/theme.remote.ts");
		expect(await signedOut(() => call(getTheme))).toBeUndefined();
	});
});
