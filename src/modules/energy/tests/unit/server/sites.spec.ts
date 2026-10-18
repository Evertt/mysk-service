/**
 * The energy pages' queries and who may use them, on the seeded demo database: a zone the site
 * doesn't have is a 404, a report covers 1 to 92 days, a customer's contact reads its own sites'
 * energy only (another customer's contact none of Riedel's), and a planner reads the sites but
 * can't set one up. The server side of `energy.test.ts`, `energy.portal.test.ts` and
 * `energy.tenancy.test.ts`, which keep the pages.
 */
import { describe, expect, test } from "vite-plus/test";

import { getClientEnergy } from "#modules/energy/client/client-energy.remote.ts";
import {
	getEnergyOverview,
	getEnergyReport,
	getEnergySites,
	getEnergyZone,
} from "#modules/energy/energy.remote.ts";
import { getEnergySetup, saveEnergyZone } from "#modules/energy/setup/setup.remote.ts";
import { getEnergySiteChoices } from "#modules/energy/sites.remote.ts";
import {
	as,
	call,
	data,
	demoAccount,
	rows,
	shltr,
	submit,
} from "#unit/lib/server/harness/index.ts";

import { riedel } from "./energy.test-support.ts";

const weggemansContact = demoAccount("rob@weggemans.example");

describe("a site's pages", () => {
	test("a zone the site has is its figures, one it hasn't is a 404", async () => {
		const { siteId } = await riedel();
		await as(shltr.member, async () => {
			const zone = await data(getEnergyZone, { site: siteId, zone: "Z-LAB" });
			expect(zone.zone.code).toBe("Z-LAB");
			expect(await call(getEnergyZone, { site: siteId, zone: "Z-NOPE" })).toMatchObject({
				status: 404,
			});
			expect(await call(getEnergyOverview, { site: 999_999, period: "day" })).toMatchObject({
				status: 404,
			});
		});
	});

	test("a report covers a range of 1 to 92 days", async () => {
		const { siteId } = await riedel();
		await as(shltr.member, async () => {
			const report = (from: string, to: string) =>
				call(getEnergyReport, { site: siteId, from, to });
			expect(await report("2026-07-01", "2026-09-30")).toMatchObject({
				status: 200,
				data: { days: 92 },
			});
			expect(await report("2026-01-01", "2026-10-01")).toMatchObject({ status: 400 });
			expect(await report("2026-10-07", "2026-10-01")).toMatchObject({ status: 400 });
		});
	});
});

describe("the customer portal", () => {
	test("gives Riedel's contact its own site's energy", async () => {
		const { siteId } = await riedel();
		const { sites } = await as(shltr.customer, () => data(getClientEnergy, "day"));
		expect(sites.map((site) => site.site.id)).toEqual([siteId]);
		// Without the units' links into the office.
		for (const door of sites[0].doors)
			expect(door).toMatchObject({ unit: null, equipmentId: null });
	});

	test("gives another customer's contact none of Riedel's sites", async () => {
		const { siteId } = await riedel();
		const own = await rows<{ id: number }>(
			`select e.id from energy_site e join customer_site s on s.id = e.site_id
			 join customer c on c.id = s.customer_id where c.name = 'Weggemans Logistiek'`,
		);
		const { sites } = await as(weggemansContact, () => data(getClientEnergy, "month"));
		expect(sites.map((site) => site.site.id)).toEqual(own.map((row) => row.id));
		expect(sites.map((site) => site.site.id)).not.toContain(siteId);
	});

	test("the office's queries are no contact's", async () => {
		expect(await as(shltr.customer, () => call(getEnergySites))).toMatchObject({ status: 403 });
	});
});

describe("a planner", () => {
	test("reads the sites, but can't set one up", async () => {
		const { siteId } = await riedel();
		await as(shltr.member, async () => {
			expect((await data(getEnergySites)).canManage).toBe(false);
			expect(await call(getEnergySetup, siteId)).toMatchObject({ status: 403 });
			expect(await call(getEnergySiteChoices)).toMatchObject({ status: 403 });
			expect(
				await submit(saveEnergyZone, {
					energySiteId: String(siteId),
					code: "Z-PLAN",
					name: "Planner's",
				}),
			).toMatchObject({ status: 403 });
		});
		expect(await as(shltr.owner, () => call(getEnergySetup, siteId))).toMatchObject({
			status: 200,
		});
	});
});
