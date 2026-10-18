/**
 * Materials and the orders, on the seeded demo database: the seed's stock is its ledger's sum,
 * and its orders' lines took their materials, except quotes' and cancelled ones'; an engineer's
 * materials on a job are logged as theirs; and a tenant with materials switched off prices its
 * orders by their labour, and its order form takes no materials, also when a tampered form sends
 * them. The server side of `materials.test.ts`, `materials.orders.test.ts`,
 * `materials.portal.test.ts` and `materials.tenancy.test.ts`, which keep the pages and forms.
 */
import { describe, expect, test } from "vite-plus/test";

import { getOrders } from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import { createOrder, deleteOrder, getOrder, updateOrder } from "#lib/orders/order.remote.ts";
import { saveFieldMaterials } from "#modules/materials/portal/field-materials.remote.ts";
import { editForm, orderId } from "#unit/lib/orders/server/order-form.test-support.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The materials whose stock isn't the sum of their movements. */
const unbalancedStock = (organization: string) =>
	rows(
		`select sku, stock, movements from (
			select m.sku, m.stock, round(coalesce(sum(s.quantity), 0), 2) as movements
			from material m left join stock_movement s on s.material_id = m.id
			where m.organization_id = ? group by m.id
		) where round(stock, 2) <> movements`,
		[organization],
	);

/** How many stock movements an organization has. */
const movementCount = (organization: string) =>
	value<number>(`select count(*) from stock_movement where organization_id = ?`, [organization]);

describe("the seed", () => {
	test.each([
		["North", northId],
		["South", southId],
	])("gives %s's materials the stock their movements add up to", async (_, organization) => {
		expect(await unbalancedStock(organization)).toEqual([]);
	});

	test("took its orders' materials from stock, except quotes' and cancelled ones'", async () => {
		expect(
			await rows(
				`select o.number, entry.material_id, round(sum(entry.quantity), 2) as difference from (
					select l.order_id, l.material_id, l.quantity from order_line l
					join "order" o on o.id = l.order_id
					where l.organization_id = ? and o.status not in ('quote', 'cancelled')
					union all
					select order_id, material_id, quantity from stock_movement
					where organization_id = ? and order_id is not null
				) entry join "order" o on o.id = entry.order_id
				group by entry.order_id, entry.material_id having round(sum(entry.quantity), 2) <> 0`,
				[northId, northId],
			),
			"orders whose movements don't add up to their lines",
		).toEqual([]);
		expect(
			await value(
				`select count(*) from stock_movement where kind = 'consumption' and organization_id = ?`,
				[northId],
			),
		).toBeGreaterThan(1000);
	});
});

describe("the engineer portal", () => {
	test("logs the materials an engineer uses on a job against the order, by them", async () => {
		const [job] = await rows<{ id: number; number: string; user_id: string }>(
			`select o.id, o.number, e.user_id from "order" o join engineer e on e.id = o.engineer_id
			 join user u on u.id = e.user_id where u.email = ? and o.status = 'scheduled'
			 order by o.scheduled_for desc limit 1`,
			[north.engineer.email],
		);
		// Started (the portal's own command is core's).
		await value(`update "order" set status = 'in_progress' where id = ?`, [job.id]);
		const lines = await rows<{ material_id: number; quantity: number }>(
			`select material_id, quantity from order_line where order_id = ? order by id`,
			[job.id],
		);
		const part = await value<number>(
			`select id from material where organization_id = ? and unit = 'pcs' and stock >= 3
			 and id not in (select material_id from order_line where order_id = ?) order by id limit 1`,
			[northId, job.id],
		);
		const answer = await as(north.engineer, () =>
			submit(saveFieldMaterials, {
				id: String(job.id),
				lines: [
					...lines.map((line) => ({
						materialId: String(line.material_id),
						quantity: line.quantity,
					})),
					{ materialId: String(part), quantity: 2 },
				],
			}),
		);
		expect(answer).toMatchObject({ status: 200, refreshed: ["getFieldMaterials"] });
		const [entry] = await rows<{ user_id: string; action: string; changes: string }>(
			`select user_id, action, changes from activity where organization_id = ?
			 and subject_type = 'order_line' and parent_type = 'order' and parent_id = ?
			 order by id desc limit 1`,
			[northId, String(job.id)],
		);
		expect(entry).toMatchObject({ user_id: job.user_id, action: "created" });
		expect(JSON.parse(entry.changes)).toEqual({ quantity: [null, 2] });
		expect(await unbalancedStock(northId)).toEqual([]);
	});
});

describe("South, with materials switched off", () => {
	/** One of South's completed orders with material lines, with its labour and materials. */
	const pricedOrder = async () =>
		(
			await rows<{ number: string; labor: number; materials: number }>(
				`select o.number, round(o.labor_hours * e.hourly_rate) as labor,
					(select sum(round(l.quantity * l.unit_price)) from order_line l where l.order_id = o.id)
					as materials
				 from "order" o join engineer e on e.id = o.engineer_id
				 where o.organization_id = ? and o.status = 'completed'
				 and exists (select 1 from order_line l where l.order_id = o.id)
				 order by o.id limit 1`,
				[southId],
			)
		)[0];

	test("prices an order by its labour, on its page and in the list; with materials on, by both", async () => {
		const order = await pricedOrder();
		const query = {
			q: order.number,
			filters: {},
			sort: [{ id: "createdAt", desc: true }],
			group: null,
			pageIndex: 0,
			pageSize: ordersList.pageSize,
		} as Parameters<typeof getOrders>[0];
		const priced = () =>
			as(south.owner, async () => ({
				page: (await data(getOrder, order.number)).totals,
				listed: (await data(getOrders, query)).rows.map((row) => row.total),
			}));

		const off = await withoutModule("south", "materials", priced);
		expect(off.page).toMatchObject({ labor: order.labor, costs: [], total: order.labor });
		expect(off.listed).toEqual([order.labor]);

		const on = await priced();
		expect(on.page.total).toBe(order.labor + order.materials);
		expect(on.listed).toEqual([order.labor + order.materials]);
	});

	test("refuses an order form with materials, as a tampered one sends them, and stores nothing", async () => {
		const description = "Without materials (materials spec)";
		const [customerId, engineerId, materialId] = await Promise.all(
			[
				`select min(id) from customer where organization_id = ?`,
				`select min(id) from engineer where organization_id = ? and active = 1`,
				`select min(id) from material where organization_id = ?`,
			].map((sql) => value<number>(sql, [southId])),
		);
		const form = (lines: { materialId: string; quantity: number }[]) => ({
			customerId: String(customerId),
			equipmentIds: [],
			engineerId: String(engineerId),
			type: "repair",
			status: "scheduled",
			priority: "normal",
			description,
			scheduledFor: "",
			scheduledTime: "",
			laborHours: 2,
			modules: { materials: { lines } },
		});
		const movements = await movementCount(southId);
		const created = () =>
			rows<{ id: number; number: string }>(
				`select id, number from "order" where organization_id = ? and description = ?`,
				[southId, description],
			);

		await withoutModule("south", "materials", async () => {
			const refused = await as(south.owner, () =>
				submit(createOrder, form([{ materialId: String(materialId), quantity: 1 }])),
			);
			expect(refused.status).toBe(400);
			expect(refused.issues?.map((issue) => issue.message)).toContain(
				"Materials is switched off for this organization: reload the page and try again.",
			);
			expect(await created()).toEqual([]);

			// Without the part, it makes the order, with no lines and no stock moved.
			const { modules: _modules, ...plain } = form([]);
			const made = await as(south.owner, () => submit(createOrder, plain));
			expect(made.status).toBe(303);
			const [{ id, number }] = await created();
			expect(await value(`select count(*) from order_line where order_id = ?`, [id])).toBe(0);

			// Nor does cancelling or deleting it move any.
			const { modules: _parts, ...edit } = await editForm(south.owner, number, {
				status: "cancelled",
			});
			expect(await as(south.owner, () => submit(updateOrder, edit))).toMatchObject({
				status: 303,
			});
			expect(await as(south.owner, () => submit(deleteOrder, { id: String(id) }))).toMatchObject({
				status: 303,
			});
			expect(await orderId(number, southId)).toBeUndefined();
		});
		expect(await movementCount(southId)).toBe(movements);
		expect(await unbalancedStock(southId)).toEqual([]);
	});
});
