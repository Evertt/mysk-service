/**
 * The sites' figures (`summarizeSites()`, the `customers.siteSummary` collector) and the sites
 * overview, site page and report built on them, in the office (`sites.remote.ts`) and the customer
 * portal (`portal/sites/sites.remote.ts`), on the seeded database: core's figures against SQL, the
 * period's edges, the modules' figures merged in their places, and who sees which sites: South not
 * North's, customer A not B's, a site-limited contact only their site, also by tampered ids and
 * codes.
 */
import { describe, expect, test } from "vite-plus/test";

import { periodOf, summarizeSites } from "#lib/customers/server/site-summary.ts";
import { needsAttention, worstFirst } from "#lib/customers/sites/figures.ts";
import {
	getCustomerSite,
	getCustomerSiteReport,
	getCustomerSites,
} from "#lib/customers/sites/sites.remote.ts";
import { currentDay, dayOf, fromMomentSeconds, momentSeconds, startOfDay } from "#lib/dates.ts";
import { Refused } from "#lib/server/refused.ts";
import {
	getPortalSite,
	getPortalSiteOverview,
	getPortalSiteReport,
} from "#routes/(customer)/portal/sites/sites.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	south,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";
import { day } from "#unit/temporal-support.ts";

const shltrId = organizationId("shltr");
const weggemans = demoAccount("rob@weggemans.example");

/** A SHLTR customer with three sites (the head office's case), and its sites' ids. */
async function zutphen() {
	const sites = await rows<{ id: number; code: string }>(
		`select s.id, c.code from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = 'Distributiecentrum Zutphen' order by s.id`,
		[shltrId],
	);
	return { code: sites[0].code, siteIds: sites.map((site) => site.id) };
}

/** The id of a site of Riedel (`shltr.customer`'s customer) and of Weggemans. */
const siteOf = (name: string) =>
	value<number>(
		`select s.id from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = ? order by s.id limit 1`,
		[shltrId, name],
	);

/** A figure's value among `figures`. */
const valueOf = (figures: { id: string; value: number }[], id: string) =>
	figures.find((figure) => figure.id === id)?.value;

describe("core's figures", () => {
	test("count the open faults, on the way and scheduled today as SQL does", async () => {
		const { siteIds } = await zutphen();
		const summary = await as(shltr.member, () =>
			summarizeSites({ siteIds, period: periodOf({}), today: currentDay(), units: false }),
		);
		for (const siteId of siteIds) {
			const atSite = `from "order" o where o.organization_id = ? and exists (select 1 from order_unit ou
				join equipment e on e.id = ou.equipment_id where ou.order_id = o.id and e.site_id = ?)`;
			const openFaults = await value<number>(
				`select count(*) ${atSite} and (o.status = 'awaiting_acceptance' or (o.type = 'breakdown'
				 and o.status in ('quote', 'scheduled', 'on_the_way', 'in_progress')))`,
				[shltrId, siteId],
			);
			const onTheWay = await value<number>(
				`select count(*) ${atSite} and o.status = 'on_the_way'`,
				[shltrId, siteId],
			);
			const figures = summary.figures.get(siteId)!;
			expect(valueOf(figures, "core.openFaults"), `site ${siteId}`).toBe(openFaults);
			expect(valueOf(figures, "core.onTheWay"), `site ${siteId}`).toBe(onTheWay);
		}
	});

	test("count a breakdown reported on the period's first day, not on the day after its last", async () => {
		const { siteIds } = await zutphen();
		const [order] = await rows<{ created_at: number; site_id: number }>(
			`select o.created_at, e.site_id from "order" o join order_unit ou on ou.order_id = o.id
			 join equipment e on e.id = ou.equipment_id
			 where o.organization_id = ? and o.type = 'breakdown' and o.status <> 'cancelled'
			 and e.site_id in (${siteIds.join(",")}) order by o.created_at desc limit 1`,
			[shltrId],
		);
		/** Core's count of faults reported over `from`–`to`, and SQL's over those days' moments. */
		const both = (from: Temporal.PlainDate, to: Temporal.PlainDate) =>
			as(shltr.member, async () => {
				const summary = await summarizeSites({
					siteIds: [order.site_id],
					period: { from, to },
					today: currentDay(),
					units: false,
				});
				const sql = await value<number>(
					`select count(distinct o.id) from "order" o join order_unit ou on ou.order_id = o.id
					 join equipment e on e.id = ou.equipment_id
					 where o.organization_id = ? and e.site_id = ? and o.type = 'breakdown'
					 and o.status <> 'cancelled' and o.created_at >= ? and o.created_at < ?`,
					[
						shltrId,
						order.site_id,
						momentSeconds(startOfDay(from)),
						momentSeconds(startOfDay(to.add({ days: 1 }))),
					],
				);
				return { core: valueOf(summary.figures.get(order.site_id)!, "core.faultsReported"), sql };
			});
		const on = await as(shltr.member, () => dayOf(fromMomentSeconds(order.created_at)));
		// The day itself, as its first and as its last: it counts; the days around it: theirs only.
		const itself = await both(on, on);
		expect(itself.core).toBeGreaterThan(0);
		expect(itself.core).toBe(itself.sql);
		const after = await both(on.add({ days: 1 }), on.add({ days: 2 }));
		expect(after.core).toBe(after.sql);
		const before = await both(on.subtract({ days: 2 }), on.subtract({ days: 1 }));
		expect(before.core).toBe(before.sql);
		expect((await both(on.subtract({ days: 2 }), on.add({ days: 2 }))).core).toBe(
			before.sql + itself.sql + after.sql,
		);
	});

	test("the period: this month so far by default, refused backwards or longer than a year", () => {
		const today = day("2026-11-18");
		expect(periodOf({}, today)).toEqual({ from: day("2026-11-01"), to: today });
		expect(periodOf({ from: "2026-02-01", to: "2026-02-28" }, today)).toEqual({
			from: day("2026-02-01"),
			to: day("2026-02-28"),
		});
		expect(() => periodOf({ from: "2026-03-02", to: "2026-03-01" }, today)).toThrow(Refused);
		expect(() => periodOf({ from: "2025-01-01", to: "2026-03-01" }, today)).toThrow(Refused);
		expect(() => periodOf({ from: "2026-03-01", to: "2026-03-01" }, today)).not.toThrow();
	});
});

describe("the modules' figures", () => {
	test("come in their places, and go with a module that's off", async () => {
		const { siteIds } = await zutphen();
		const ask = () =>
			summarizeSites({ siteIds, period: periodOf({}), today: currentDay(), units: true });
		const on = await as(shltr.member, ask);
		const sections = [
			...new Set(on.figures.get(siteIds[0])!.map((figure) => figure.id.split(".")[0])),
		];
		expect(sections).toEqual(["condition", "checklists", "maintenance", "core"]);
		expect(on.columns.map((column) => column.id)).toContain("condition.score");
		expect(on.watches).toEqual(expect.arrayContaining(["order", "unitCondition", "checklist"]));

		const off = await withoutModule("shltr", "condition", () => as(shltr.member, ask));
		expect(off.figures.get(siteIds[0])!.some((figure) => figure.id.startsWith("condition."))).toBe(
			false,
		);
		expect(off.columns.map((column) => column.id)).not.toContain("condition.score");
	});

	test("order the overview worst first, and say which sites need attention", () => {
		const figure = (id: string, value: number, chip?: "danger" | "warning" | "info") => ({
			id,
			section: "s",
			label: id,
			value,
			place: 1,
			...(chip ? { chip } : {}),
		});
		const sites = [
			{ name: "Calm", figures: [figure("a", 3, "info"), figure("b", 9)] },
			{ name: "Busy", figures: [figure("a", 1, "warning")] },
			{ name: "Burning", figures: [figure("a", 1, "danger"), figure("c", 0, "danger")] },
			{ name: "Alpha", figures: [] },
		];
		expect(worstFirst(sites).map((site) => site.name)).toEqual([
			"Burning",
			"Busy",
			"Alpha",
			"Calm",
		]);
		expect(sites.map((site) => needsAttention(site.figures))).toEqual([false, true, true, false]);
	});
});

describe("the office", () => {
	test("sees a customer's sites, worst first, and their page and report", async () => {
		const { code, siteIds } = await zutphen();
		const overview = await as(shltr.member, () => data(getCustomerSites, code));
		expect(overview.customer.code).toBe(code);
		expect(overview.sites.map((site) => site.id).toSorted((a, b) => a - b)).toEqual(siteIds);
		expect(overview.sites.map((site) => site.name)).toEqual(
			worstFirst(overview.sites).map((site) => site.name),
		);

		const id = String(siteIds[0]);
		const page = await as(shltr.member, () => data(getCustomerSite, { code, id }));
		expect(page.units.length).toBe(
			await value<number>("select count(*) from equipment where site_id = ?", [siteIds[0]]),
		);
		expect(page.open.every((order) => order.status !== "completed")).toBe(true);

		const report = await as(shltr.member, () =>
			data(getCustomerSiteReport, { code, id, from: "2026-01-01", to: "2026-12-31" }),
		);
		expect(report.period).toEqual({ from: day("2026-01-01"), to: day("2026-12-31") });
		expect(report.units.length).toBe(page.units.length);
		expect(report.columns.length).toBeGreaterThan(0);
		expect(
			await as(shltr.member, () =>
				call(getCustomerSiteReport, { code, id, from: "2026-02-01", to: "2026-01-01" }),
			),
		).toMatchObject({ status: 400 });
	});

	test("finds no site of another customer by its code, nor another tenant's", async () => {
		const { code, siteIds } = await zutphen();
		const riedelSite = String(await siteOf("Riedel B.V."));
		// Riedel's site under Zutphen's code: tampered.
		const tampered: (() => Promise<{ status: number }>)[] = [
			() => call(getCustomerSite, { code, id: riedelSite }),
			() => call(getCustomerSiteReport, { code, id: riedelSite }),
		];
		for (const ask of tampered) {
			expect(await as(shltr.member, ask)).toMatchObject({ status: 404 });
		}
		// Codes are per tenant: South's customer of the same code has South's sites, never SHLTR's.
		const southIds = (
			await rows<{ id: number }>("select id from customer_site where organization_id = ?", [
				organizationId("south"),
			])
		).map((row) => row.id);
		const southAnswer = await as(south.owner, () => call(getCustomerSites, code));
		if (southAnswer.status === 200) {
			for (const site of (southAnswer.data as { sites: { id: number }[] }).sites) {
				expect(southIds).toContain(site.id);
			}
		} else expect(southAnswer).toMatchObject({ status: 404 });
		const [{ code: northCode, id: northSite }] = await rows<{ code: string; id: number }>(
			`select c.code, s.id from customer c join customer_site s on s.customer_id = c.id
			 where c.organization_id = ? order by s.id limit 1`,
			[organizationId("north")],
		);
		expect(
			await as(south.owner, () =>
				call(getCustomerSite, { code: northCode, id: String(northSite) }),
			),
		).toMatchObject({ status: 404 });
		expect(
			await as(north.owner, () => call(getCustomerSite, { code, id: String(siteIds[0]) })),
		).toMatchObject({ status: 404 });
	});

	test("is refused the portal's functions, and a contact the office's", async () => {
		expect(await as(shltr.member, () => call(getPortalSiteOverview))).toMatchObject({
			status: 403,
		});
		const { code } = await zutphen();
		expect(await as(shltr.customer, () => call(getCustomerSites, code))).toMatchObject({
			status: 403,
		});
	});
});

describe("the customer portal", () => {
	test("shows a contact their customer's sites only, and another's is a 404", async () => {
		const riedelSite = await siteOf("Riedel B.V.");
		const weggemansSite = await siteOf("Weggemans Logistiek");
		const overview = await as(shltr.customer, () => data(getPortalSiteOverview));
		expect(overview.sites.map((site) => site.id)).toEqual([riedelSite]);
		expect(overview.sites[0].figures.some((figure) => figure.id === "energy.lostToday")).toBe(true);
		// The office's energy alerts are not the contact's.
		expect(overview.sites[0].figures.some((figure) => figure.id === "energy.alerts")).toBe(false);

		expect(await as(shltr.customer, () => call(getPortalSite, String(riedelSite)))).toMatchObject({
			status: 200,
		});
		const others: (() => Promise<{ status: number }>)[] = [
			() => call(getPortalSite, String(weggemansSite)),
			() => call(getPortalSiteReport, { id: String(weggemansSite) }),
		];
		for (const ask of others) {
			expect(await as(shltr.customer, ask)).toMatchObject({ status: 404 });
		}
		expect(
			(await as(weggemans, () => data(getPortalSiteOverview))).sites.map((site) => site.id),
		).toEqual([weggemansSite]);
		// Another tenant's contact: a site of SHLTR's is not found.
		expect(await as(north.customer, () => call(getPortalSite, String(riedelSite)))).toMatchObject({
			status: 404,
		});
	});

	test("shows a site-limited contact only their sites, and their units and orders there", async () => {
		// Last: changes the database. Riedel's contact becomes Zutphen's, limited to its first site.
		const { siteIds } = await zutphen();
		const contact = await value<number>(
			`select p.id from portal_contact p join user u on u.id = p.user_id
			 where u.email = ? and p.organization_id = ?`,
			[shltr.customer.email, shltrId],
		);
		const customerId = await value<number>("select customer_id from customer_site where id = ?", [
			siteIds[0],
		]);
		await rows("delete from portal_contact_site where contact_id = ?", [contact]);
		await rows("update portal_contact set customer_id = ?, all_sites = 0 where id = ?", [
			customerId,
			contact,
		]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values (?, ?, ?, ?)`,
			[shltrId, contact, customerId, siteIds[0]],
		);

		const overview = await as(shltr.customer, () => data(getPortalSiteOverview));
		expect(overview.sites.map((site) => site.id)).toEqual([siteIds[0]]);
		const report = await as(shltr.customer, () =>
			data(getPortalSiteReport, { id: String(siteIds[0]) }),
		);
		expect(report.units.every((unit) => unit.site.id === siteIds[0])).toBe(true);
		for (const other of siteIds.slice(1)) {
			expect(await as(shltr.customer, () => call(getPortalSite, String(other)))).toMatchObject({
				status: 404,
			});
		}
		// The office sees all three.
		const { code } = await zutphen();
		expect((await as(shltr.member, () => data(getCustomerSites, code))).sites).toHaveLength(3);
	});
});
