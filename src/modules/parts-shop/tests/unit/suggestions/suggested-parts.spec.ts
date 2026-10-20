/**
 * The parts a checklist's rejected points need, on the seeded demo database: the office adds one
 * to an order as a material line, which refreshes the order and the modules' cards on it as the
 * order form's change does (`orders.committed`); and an order that can't take lines says so. The
 * server side of `shop.checklists.test.ts`, which keeps the page.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	addSuggestedPart,
	getSuggestedParts,
} from "#modules/parts-shop/suggestions/suggested-parts.remote.ts";
import { as, data, organizationId, rows, shltr, submit } from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

/** One of SHLTR's orders in `status`, and one of its shop's products. */
async function orderAndProduct(status: string) {
	const [order] = await rows<{ id: number; number: string }>(
		`select id, number from "order" where organization_id = ? and status = ? order by id limit 1`,
		[shltrId, status],
	);
	const [product] = await rows<{ id: number; material_id: number }>(
		`select p.id, p.material_id from shop_product p join material m on m.id = p.material_id
		 where p.organization_id = ? and m.unit = 'pcs' order by p.id limit 1`,
		[shltrId],
	);
	return { order, product };
}

describe("a suggested part", () => {
	test("is added to the order, which refreshes it and the modules' cards on it", async () => {
		const { order, product } = await orderAndProduct("completed");
		const answer = await as(shltr.member, () =>
			submit(addSuggestedPart, { number: order.number, productId: String(product.id) }),
		);
		expect(answer).toMatchObject({ status: 200 });
		// The checklists' card watches the order (`watchRecord`), which the line is logged on.
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getOrder", "getOrderInvoice"]));
		expect(
			await rows(`select quantity from order_line where order_id = ? and material_id = ?`, [
				order.id,
				product.material_id,
			]),
		).toHaveLength(1);
	});

	test("can't be added to an invoiced order", async () => {
		const { order, product } = await orderAndProduct("invoiced");
		await as(shltr.member, async () => {
			expect(
				await data(getSuggestedParts, { number: order.number, ids: [], articles: [] }),
			).toMatchObject({ canAdd: false });
			expect(
				await submit(addSuggestedPart, { number: order.number, productId: String(product.id) }),
			).toMatchObject({ status: 400 });
		});
	});
});
