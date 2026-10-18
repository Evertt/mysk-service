/**
 * The parts used on a unit, on the seeded demo database: the lines of an order for several units
 * count on each of them, with the order's number of units, so the card can say they're shared
 * rather than the unit's alone; a unit's own orders' parts have one.
 */
import { describe, expect, test } from "vite-plus/test";

import { getPartsUsed } from "#modules/materials/detail/parts-used.remote.ts";
import { as, data, organizationId, rows, shltr } from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

/** A done order of SHLTR's with material lines whose units number `units` (`=` or `>`). */
const doneOrder = (units: "= 1" | "> 1") =>
	rows<{ id: number; units: number; serial: string }>(
		`select o.id, (select count(*) from order_unit u where u.order_id = o.id) as units,
		 (select e.serial_number from order_unit u join equipment e on e.id = u.equipment_id
		  where u.order_id = o.id order by u.position limit 1) as serial
		 from "order" o where o.organization_id = ? and o.status in ('completed', 'invoiced')
		 and exists (select 1 from order_line l where l.order_id = o.id)
		 and (select count(*) from order_unit u where u.order_id = o.id) ${units}
		 order by units desc, o.id limit 1`,
		[shltrId],
	).then(([found]) => found);

/** The SKUs on an order's lines. */
const skusOf = (orderId: number) =>
	rows<{ sku: string }>(
		`select distinct m.sku from order_line l join material m on m.id = l.material_id
		 where l.order_id = ?`,
		[orderId],
	).then((found) => found.map((row) => row.sku));

describe("the parts used on a unit", () => {
	test("say an order's parts are shared by its units", async () => {
		const shared = await doneOrder("> 1");
		expect(shared.units).toBeGreaterThan(1);
		const parts = await as(shltr.member, () => data(getPartsUsed, shared.serial));
		for (const sku of await skusOf(shared.id)) {
			const part = parts.find((each) => each.sku === sku);
			expect(part?.units, sku).toBeGreaterThanOrEqual(shared.units);
		}
	});

	test("count one unit for the parts of the unit's own orders", async () => {
		const own = await doneOrder("= 1");
		const parts = await as(shltr.member, () => data(getPartsUsed, own.serial));
		const skus = await skusOf(own.id);
		expect(parts.filter((part) => skus.includes(part.sku)).length).toBe(skus.length);
		// Unless the unit was on a shared order with the same material too.
		const shared = await rows<{ sku: string }>(
			`select distinct m.sku from order_unit u join "order" o on o.id = u.order_id
			 join order_line l on l.order_id = o.id join material m on m.id = l.material_id
			 join equipment e on e.id = u.equipment_id
			 where e.serial_number = ? and e.organization_id = ? and o.status in ('completed', 'invoiced')
			 and (select count(*) from order_unit x where x.order_id = o.id) > 1`,
			[own.serial, shltrId],
		);
		for (const part of parts) {
			if (!shared.some((row) => row.sku === part.sku)) expect(part.units, part.sku).toBe(1);
		}
	});
});
