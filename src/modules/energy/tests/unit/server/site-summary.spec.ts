/**
 * The energy module's figures about sites (`server/site-summary.ts`), on SHLTR's seeded energy
 * site: the energy lost through its doors today and in the period, a chip for today's, the open
 * alerts as SQL counts them for the office only (a contact reads no alerts), and nothing of a site
 * the viewer may not read.
 */
import { expect, test } from "vite-plus/test";

import { currentDay } from "#lib/dates.ts";
import { energySiteSummary } from "#modules/energy/server/site-summary.ts";
import {
	as,
	demoAccount,
	organizationId,
	shltr,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

/** The customer site the seeded energy site is at. */
const monitored = () =>
	value<number>("select site_id from energy_site where organization_id = ? limit 1", [
		organizationId("shltr"),
	]);

const ask = (siteId: number) => {
	const today = currentDay();
	return energySiteSummary({
		siteIds: [siteId],
		period: { from: today.with({ day: 1 }), to: today },
		today,
		units: false,
	});
};

test("tells the office the doors' losses and the open alerts", async () => {
	const siteId = await monitored();
	const { figures, watches } = await as(shltr.member, () => ask(siteId));
	const own = figures.get(siteId)!;
	const byId = new Map(own.map((figure) => [figure.id, figure]));
	expect(byId.get("energy.lostToday")).toMatchObject({ format: "kwh", chip: "warning" });
	expect(byId.get("energy.lostPeriod")!.value).toBeGreaterThanOrEqual(
		byId.get("energy.lostToday")!.value - 0.1,
	);
	const open = await value<number>(
		`select count(*) from energy_alert a join energy_site s on s.id = a.energy_site_id
		 where s.site_id = ? and a.status = 'open'`,
		[siteId],
	);
	expect(byId.get("energy.alerts")?.value).toBe(open);
	expect(watches).toEqual(["energy_site", "energy_alert"]);
});

test("tells the site's contact the losses but no alerts, and others nothing", async () => {
	const siteId = await monitored();
	const contact = await as(shltr.customer, () => ask(siteId));
	expect(contact.figures.get(siteId)!.map((figure) => figure.id)).toEqual([
		"energy.lostToday",
		"energy.lostPeriod",
	]);
	expect((await as(demoAccount("rob@weggemans.example"), () => ask(siteId))).figures.size).toBe(0);
	expect((await as(south.owner, () => ask(siteId))).figures.size).toBe(0);
});
