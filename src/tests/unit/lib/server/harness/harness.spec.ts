/**
 * The server spec harness: a copy of the seeded demo database per file, running as the demo's
 * people (or the system), and remote functions answering as SvelteKit's server answers the client.
 */
import { tmpdir } from "node:os";

import { DATABASE_URL } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { describe, expect, test } from "vite-plus/test";

import { getCurrentUser, getTenantModules } from "#lib/auth/session.remote.ts";
import { getTimeZone } from "#lib/dates.ts";
import {
	addEquipmentCategory,
	deleteEquipmentCategory,
	getCategorySettings,
} from "#lib/equipment/categories/categories.remote.ts";
import { watchAwaitingAcceptance } from "#lib/orders/detail/acceptance.remote.ts";
import { setOrderStatus } from "#lib/orders/list/order-status.remote.ts";
import { getOrder } from "#lib/orders/order.remote.ts";
import { getLocale } from "#lib/paraglide/runtime.js";
import {
	currentCustomer,
	currentEngineer,
	currentTenant,
	currentUser,
	requireManager,
} from "#lib/server/auth/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";
import { getTheme, setTheme } from "#lib/themes/theme.remote.ts";
import { getPortalMe } from "#routes/(customer)/portal/client.remote.ts";
import { getMyWork } from "#routes/(field)/my/portal.remote.ts";
import {
	as,
	asSystem,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	signedOut,
	south,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

/** An order of North's whose number South has no order with. */
const northOnlyOrder = () =>
	value<string>(
		`select number from "order" o where organization_id = 'org-north' and not exists
			(select 1 from "order" s where s.organization_id = 'org-south' and s.number = o.number)
		 order by id limit 1`,
	);

describe("the database", () => {
	test("is this file's copy of the seeded demo database, not the app's", async () => {
		expect(DATABASE_URL).toMatch(new RegExp(`^file:${tmpdir()}`));
		const organizations = await rows<{ id: string; name: string }>(
			"select id, name from organization order by id",
		);
		expect(organizations.map((o) => o.name)).toEqual([
			"Fieldworks Noord",
			"SHLTR",
			"Fieldworks Zuid",
		]);
		expect(
			Number(
				await value(`select count(*) from "order" where organization_id = ?`, [
					organizationId("north"),
				]),
			),
		).toBeGreaterThan(100);
		// Paused, as the e2e tests have them.
		expect(await value("select count(*) from simulation where running = 1")).toBe(0);
	});
});

describe("running as someone", () => {
	test("sees them signed in, in their organization, with its modules", async () => {
		const seen = await as(north.owner, () => ({
			email: currentUser().email,
			tenant: currentTenant().organizationId,
			roles: currentTenant().roles,
			modules: currentTenant().modules,
			session: getRequestEvent().locals.session?.activeOrganizationId,
		}));
		expect(seen).toMatchObject({
			email: "admin@fieldworks.example",
			tenant: "org-north",
			roles: ["owner"],
			session: "org-north",
		});
		expect(seen.modules).toContain("contracts");
		expect(seen.modules).not.toContain("docks");
		// The same account, in South.
		expect(await as(south.owner, () => currentTenant().organizationId)).toBe("org-south");
		expect(await as(south.owner, () => currentTenant().modules)).toEqual(["invoices", "materials"]);
	});

	test("as the demo's engineers and customers' contacts, with what they're linked to", async () => {
		expect(await as(north.engineer, async () => (await currentEngineer()).organizationId)).toBe(
			"org-north",
		);
		expect(await as(shltr.customer, async () => (await currentCustomer()).customer.name)).toBe(
			"Riedel B.V.",
		);
		const weggemans = demoAccount("rob@weggemans.example");
		expect(weggemans).toMatchObject({ organization: "shltr", role: "customer" });
		expect(await as(weggemans, async () => (await currentCustomer()).customer.name)).toBe(
			"Weggemans Logistiek",
		);
	});

	test("adds the roles the seed has no one for", async () => {
		expect(await as(north.admin, () => requireManager().roles)).toEqual(["admin"]);
		expect(await as(south.member, () => currentTenant().roles)).toEqual(["member"]);
		const engineer = await as(south.engineer, () => currentEngineer());
		expect(engineer).toMatchObject({ organizationId: "org-south", active: true });
		const contact = await as(south.customer, () => currentCustomer());
		expect(contact.siteIds).toBeNull();
		expect(
			await value("select organization_id from customer where id = ?", [contact.customer.id]),
		).toBe("org-south");
		// Once: the second time, the same account.
		expect((await as(south.engineer, () => currentEngineer())).email).toBe(engineer.email);
		expect(
			await value(
				"select count(*) from engineer e join user u on u.id = e.user_id where u.email = ?",
				[south.engineer.email],
			),
		).toBe(1);
		expect(await value("select count(*) from user where email = ?", [south.engineer.email])).toBe(
			1,
		);
	});

	test("in their language and time zone", async () => {
		expect(await as(north.owner, () => [getLocale(), getTimeZone()])).toEqual([
			"en",
			"Europe/Amsterdam",
		]);
		const options = { locale: "nl", timeZone: "America/New_York" } as const;
		expect(await as(north.owner, () => [getLocale(), getTimeZone()], options)).toEqual([
			"nl",
			"America/New_York",
		]);
		const answer = await as(north.owner, () => call(getOrder, "ORD-NONE"), { locale: "nl" });
		expect(answer).toEqual({ status: 404, message: "Opdracht ORD-NONE niet gevonden" });
	});

	test("as the system, with no one signed in", async () => {
		const seen = await asSystem("shltr", () => ({
			tenant: currentTenant().organizationId,
			roles: currentTenant().roles,
			user: currentUser().id,
			modules: currentTenant().modules,
		}));
		expect(seen).toMatchObject({ tenant: "org-shltr", roles: [], user: "system" });
		expect(seen.modules).toContain("docks");
	});

	test("signed out", async () => {
		expect(await signedOut(() => call(getCurrentUser))).toMatchObject({ status: 401 });
		// Outside of `as()` as well.
		expect(await call(getTenantModules)).toMatchObject({ status: 401 });
	});
});

describe("a query", () => {
	test("answers with its data, or another tenant's id as a 404", async () => {
		const number = await northOnlyOrder();
		const answer = await as(north.owner, () => call(getOrder, number));
		expect(answer.status).toBe(200);
		expect(answer.data?.order.number).toBe(number);
		expect(await as(south.owner, () => call(getOrder, number))).toEqual({
			status: 404,
			message: `Order ${number} not found`,
		});
		expect((await as(north.owner, () => data(getOrder, number))).order.number).toBe(number);
		await expect(as(south.owner, () => data(getOrder, number))).rejects.toThrow(/"status":404/);
	});

	test("refuses an argument its schema refuses with a 400, before the gate", async () => {
		const answer = await as(north.engineer, () => call(getOrder, 12 as never));
		expect(answer).toMatchObject({ status: 400, message: "Bad Request" });
		expect(answer.issues).toHaveLength(1);
	});

	test("refuses a role its set refuses", async () => {
		const number = await northOnlyOrder();
		expect(await as(north.engineer, () => call(getOrder, number))).toMatchObject({ status: 403 });
		expect(await as(north.customer, () => call(getOrder, number))).toMatchObject({ status: 403 });
		expect(await as(north.owner, () => call(getMyWork))).toMatchObject({ status: 403 });
		expect(await as(north.owner, () => call(getPortalMe))).toMatchObject({ status: 403 });
		expect(await as(north.member, () => call(getCategorySettings))).toMatchObject({ status: 403 });
		expect(await as(north.engineer, () => data(getMyWork))).toHaveProperty("open");
	});

	test("a live one answers with its first value, its watch ending with the request", async () => {
		const seen = { finished: false, signal: undefined as AbortSignal | undefined };
		const live = forMembers.query.live(async function* () {
			seen.signal = getRequestEvent().request.signal;
			try {
				yield currentTenant().organizationId;
				yield "again";
			} finally {
				seen.finished = true;
			}
		});
		expect(await as(south.owner, () => call(live))).toEqual({ status: 200, data: "org-south" });
		expect(seen.finished).toBe(true);
		expect(seen.signal?.aborted).toBe(true);

		const awaiting = await as(shltr.owner, () => call(watchAwaitingAcceptance));
		expect(awaiting).toEqual({
			status: 200,
			data: Number(
				await value(
					`select count(*) from "order" where organization_id = 'org-shltr' and status = 'awaiting_acceptance'`,
				),
			),
		});
		expect(awaiting.data).toBeGreaterThan(0);
	});
});

describe("a command", () => {
	test("changes what it changes, and names what it refreshed", async () => {
		const [{ id }] = await rows<{ id: number }>(
			`select id from "order" where organization_id = 'org-north' and status = 'quote' order by id limit 1`,
		);
		const answer = await as(north.member, () => call(setOrderStatus, { id, status: "scheduled" }));
		expect(answer).toEqual({ status: 200, data: undefined, refreshed: [] });
		expect(await value(`select status from "order" where id = ?`, [id])).toBe("scheduled");
		// Another tenant's order, as an id the client sent.
		expect(
			await as(south.owner, () => call(setOrderStatus, { id, status: "cancelled" })),
		).toMatchObject({ status: 404 });
		expect(await value(`select status from "order" where id = ?`, [id])).toBe("scheduled");
	});

	test("keeps the cookies it sets for the visitor's next requests", async () => {
		const theme = await signedOut(async () => {
			expect(await call(setTheme, "lagoon")).toEqual({
				status: 200,
				data: undefined,
				refreshed: ["getTheme"],
			});
			return data(getTheme);
		});
		expect(theme).toBe("lagoon");
	});
});

describe("a form", () => {
	test("answers with the issues of its schema and of the handler's invalid()", async () => {
		const empty = await as(north.owner, () =>
			submit(addEquipmentCategory, { name: " ", specialty: "" }),
		);
		expect(empty.status).toBe(400);
		expect(empty.issues?.map((issue) => issue.name)).toEqual(["name"]);

		const [{ name }] = await rows<{ name: string }>(
			"select name from equipment_category where organization_id = 'org-north' limit 1",
		);
		const taken = await as(north.owner, () =>
			submit(addEquipmentCategory, { name: name.toUpperCase(), specialty: "" }),
		);
		expect(taken.status).toBe(400);
		expect(taken.issues?.map((issue) => issue.name)).toEqual(["name"]);
	});

	test("answers with its result and what it refreshed, or refuses another tenant's id", async () => {
		const added = await as(north.owner, () =>
			submit(addEquipmentCategory, { name: "Harness", specialty: "" }),
		);
		expect(added).toEqual({
			status: 200,
			data: undefined,
			refreshed: ["getCategorySettings", "getEquipmentCategories"],
		});
		const id = await value<number>(
			"select id from equipment_category where organization_id = 'org-north' and name = 'Harness'",
		);
		expect(
			await as(south.owner, () => submit(deleteEquipmentCategory, { id: String(id) })),
		).toMatchObject({ status: 404 });
		expect(
			await as(north.member, () => submit(deleteEquipmentCategory, { id: String(id) })),
		).toMatchObject({ status: 403 });
		expect(
			await as(north.owner, () => submit(deleteEquipmentCategory, { id: String(id) })),
		).toMatchObject({ status: 200 });
	});
});

describe("withoutModule", () => {
	test("switches a module off for the requests in it, and on again after", async () => {
		const modules = () => as(north.owner, () => data(getTenantModules));
		expect(await modules()).toContain("invoices");
		const inside = await withoutModule("north", "invoices", modules);
		// And partner-programme, which requires it.
		expect(inside).not.toContain("invoices");
		expect(inside).not.toContain("partner-programme");
		expect(await modules()).toContain("partner-programme");
	});
});
