/**
 * A unit's service history on the seeded demo database: each order costs what it does on its own
 * page, less what a contract includes, and an order completed today is in the history and the
 * summary at once. The server side of `src/tests/e2e/equipment.detail.test.ts`, which keeps the
 * page; the timeline's order and the summary's numbers are `detail/service-history.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { getServiceHistory } from "#lib/equipment/detail/service-history.remote.ts";
import { getOrder, updateOrder } from "#lib/orders/order.remote.ts";
import { as, data, north, organizationId, rows, submit } from "#unit/lib/server/harness/index.ts";

import { editForm } from "../../orders/server/order-form.test-support.ts";

const northId = organizationId("north");

describe("a unit's service history", () => {
	test("costs each order what its own page does, less what a contract includes", async () => {
		// North's unit with the most orders that a contract includes some of the labour of.
		const [covering] = await rows<{ serial: string }>(
			`select e.serial_number as serial from equipment e
			 join contract_equipment ce on ce.equipment_id = e.id join contract k on k.id = ce.contract_id
			 join order_unit ou on ou.equipment_id = e.id join "order" o on o.id = ou.order_id
			 where e.organization_id = ? and k.level in ('standard', 'premium') and o.labor_hours > 0
			 and o.type in ('breakdown', 'repair', 'maintenance', 'inspection')
			 and k.starts_on <= date(o.created_at, 'unixepoch', 'localtime')
			 and date(o.created_at, 'unixepoch', 'localtime') <= k.ends_on
			 group by e.id order by count(*) desc, e.id limit 1`,
			[northId],
		);
		await as(north.member, async () => {
			const { events } = await data(getServiceHistory, covering.serial);
			const orders = events.flatMap((event) => (event.kind === "order" ? [event.order] : []));
			expect(orders.length).toBeGreaterThan(0);
			expect(orders.some((order) => order.cost.adjustments.some((a) => a.amount < 0))).toBe(true);
			for (const order of orders) {
				const { totals } = await data(getOrder, order.number);
				expect(order.cost.total, order.number).toBe(totals.total);
				expect(order.cost.adjustments, order.number).toEqual(totals.adjustments);
			}
		});
	});

	test("has an order completed today in its history and summary at once", async () => {
		const [open] = await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from "order" o
			 join order_unit ou on ou.order_id = o.id join equipment e on e.id = ou.equipment_id
			 where o.organization_id = ? and o.type = 'breakdown' and o.status in ('scheduled', 'in_progress')
			 order by o.id limit 1`,
			[northId],
		);
		const completed = await as(north.member, async () =>
			submit(updateOrder, await editForm(north.member, open.number, { status: "completed" })),
		);
		expect(completed.status).toBe(303);

		const { events, stats } = await as(north.member, () => data(getServiceHistory, open.serial));
		const today = Temporal.Now.plainDateISO("Europe/Amsterdam");
		const entry = events.find(
			(event) => event.kind === "order" && event.order.number === open.number,
		);
		expect(entry).toMatchObject({ kind: "order", order: { status: "completed" } });
		expect(entry?.date.equals(today)).toBe(true);
		expect(
			stats.lastService?.toZonedDateTimeISO("Europe/Amsterdam").toPlainDate().equals(today),
		).toBe(true);
		expect(stats.daysSinceLastRepair).toBe(0);
	});
});
