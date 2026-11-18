/**
 * The maintenance module's figures about sites (`server/site-summary.ts`), on SHLTR's seeded sites:
 * the overdue and due plans as SQL counts them, the visits done in the period, each unit's next due
 * date in the report, and the same for the site's contact (who reads their units' plans) as for
 * the office, none for another customer's contact or tenant.
 */
import { expect, test } from "vite-plus/test";

import { currentDay } from "#lib/dates.ts";
import { maintenanceSiteSummary } from "#modules/maintenance/server/site-summary.ts";
import {
	as,
	demoAccount,
	organizationId,
	shltr,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

const riedelSite = () =>
	value<number>(
		`select s.id from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = 'Riedel B.V.'`,
		[organizationId("shltr")],
	);

const ask = (siteId: number) => {
	const today = currentDay();
	return maintenanceSiteSummary({
		siteIds: [siteId],
		period: { from: today.subtract({ days: 365 }), to: today },
		today,
		units: true,
	});
};

test("counts the overdue plans and the next due dates as SQL does", async () => {
	const siteId = await riedelSite();
	const { figures, columns } = await as(shltr.member, () => ask(siteId));
	const today = await as(shltr.member, () => currentDay().toString());
	const plans = `from maintenance_plan p join equipment e on e.id = p.equipment_id
		where e.site_id = ? and p.paused = 0`;
	const overdue = await value<number>(`select count(*) ${plans} and p.next_due_on < ?`, [
		siteId,
		today,
	]);
	const planned = await value<number>(`select count(distinct p.equipment_id) ${plans}`, [siteId]);
	const own = figures.get(siteId)!;
	expect(own.find((figure) => figure.id === "maintenance.overdue")?.value).toBe(overdue);
	expect(columns.find((column) => column.id === "maintenance.next")?.cells.size).toBe(planned);
	expect(planned).toBeGreaterThan(0);
});

test("answers the site's contact as the office, and no one else", async () => {
	const siteId = await riedelSite();
	const office = await as(shltr.member, () => ask(siteId));
	expect((await as(shltr.customer, () => ask(siteId))).figures).toEqual(office.figures);
	const other = await as(demoAccount("rob@weggemans.example"), () => ask(siteId));
	expect(other.figures.get(siteId)!.every((figure) => figure.value === 0)).toBe(true);
	expect(
		(await as(south.owner, () => ask(siteId))).figures.get(siteId)!.every((f) => f.value === 0),
	).toBe(true);
});
