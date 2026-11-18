/**
 * The checklists module's figures about sites (`server/site-summary.ts`), on SHLTR's seeded sites:
 * the inspections completed in the period as SQL counts them (its first and last day included),
 * each unit at most once by inspection status, expired and due as chips, and none of another
 * customer's or tenant's units.
 */
import { expect, test } from "vite-plus/test";

import { momentSeconds, startOfDay } from "#lib/dates.ts";
import { checklistSiteSummary } from "#modules/checklists/server/site-summary.ts";
import {
	as,
	demoAccount,
	organizationId,
	shltr,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";
import { day } from "#unit/temporal-support.ts";

/** The SHLTR site with the most completed inspections, and the period they span. */
const busiest = () =>
	value<number>(
		`select e.site_id from checklist k join equipment e on e.id = k.equipment_id
		 where k.organization_id = ? and k.kind = 'inspection' and k.status = 'completed'
		 group by e.site_id order by count(*) desc limit 1`,
		[organizationId("shltr")],
	);

const ask = (siteId: number, from: Temporal.PlainDate, to: Temporal.PlainDate) =>
	checklistSiteSummary({ siteIds: [siteId], period: { from, to }, today: to, units: true });

test("counts the inspections completed in the period as SQL does", async () => {
	const siteId = await busiest();
	const [from, to] = [day("2020-01-01"), day("2030-12-31")];
	const { figures, columns } = await as(shltr.member, () => ask(siteId, from, to));
	const done = await as(shltr.member, async () =>
		value<number>(
			`select count(*) from checklist k join equipment e on e.id = k.equipment_id
			 where e.site_id = ? and k.kind = 'inspection' and k.status = 'completed'
			 and k.completed_at >= ? and k.completed_at < ?`,
			[siteId, momentSeconds(startOfDay(from)), momentSeconds(startOfDay(to.add({ days: 1 })))],
		),
	);
	const own = figures.get(siteId)!;
	expect(done).toBeGreaterThan(0);
	expect(own.find((figure) => figure.id === "checklists.done")?.value).toBe(done);
	const units = await value<number>("select count(*) from equipment where site_id = ?", [siteId]);
	const byStatus = own
		.filter((figure) => figure.id !== "checklists.done")
		.reduce((sum, figure) => sum + figure.value, 0);
	expect(byStatus).toBeLessThanOrEqual(units);
	expect(own.filter((figure) => figure.chip).map((figure) => figure.id)).toEqual([
		"checklists.due",
		"checklists.expired",
	]);
	expect(columns.map((column) => column.id)).toEqual(["checklists.last", "checklists.next"]);
});

test("reads none of another customer's or tenant's units", async () => {
	const siteId = await busiest();
	const owner = await value<string>(
		"select c.name from customer_site s join customer c on c.id = s.customer_id where s.id = ?",
		[siteId],
	);
	const [from, to] = [day("2020-01-01"), day("2030-12-31")];
	if (owner !== "Weggemans Logistiek") {
		const other = await as(demoAccount("rob@weggemans.example"), () => ask(siteId, from, to));
		expect(other.figures.size).toBe(0);
	}
	expect((await as(south.owner, () => ask(siteId, from, to))).figures.size).toBe(0);
});
