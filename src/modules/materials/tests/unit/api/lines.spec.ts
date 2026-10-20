/**
 * `addOrderLine()`, the materials' service for the modules that require them (the parts shop's
 * "Add to order"), on the seeded demo database: it checks the material as the order form does (the
 * tenant's, in whole pieces), and its order's change refreshes the modules' cards on it
 * (`orders.committed`), as the order form's does. Which orders take lines is `canTakeLines()`.
 */
import { isHttpError } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import { db } from "#lib/server/db/index.ts";
import { Refused } from "#lib/server/refused.ts";
import { addOrderLine, canTakeLines } from "#modules/materials/api/lines.server.ts";
import { as, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** One of North's orders in `status`. */
const northOrder = (status: string) =>
	rows<{ id: number; number: string }>(
		`select id, number from "order" where organization_id = ? and status = ? order by id limit 1`,
		[northId, status],
	).then(([found]) => found);

/** An organization's material in `unit`. */
const materialIn = (organization: string, unit: string) =>
	value<number>(
		`select id from material where organization_id = ? and unit = ? order by id limit 1`,
		[organization, unit],
	);

const linesOf = (orderId: number) =>
	rows<{ material_id: number; quantity: number }>(
		`select material_id, quantity from order_line where order_id = ? order by id`,
		[orderId],
	);

/** What `addOrderLine()` throws, as North's planner, or nothing. */
const adding = (number: string, materialId: number, quantity: number) =>
	as(north.member, () => db.transaction((tx) => addOrderLine(tx, number, materialId, quantity)))
		.then(() => undefined)
		.catch((error: unknown) => error);

describe("addOrderLine", () => {
	test("is a 404 for another tenant's material, also on a quote, and adds nothing", async () => {
		const quote = await northOrder("quote");
		const before = await linesOf(quote.id);
		const thrown = await adding(quote.number, await materialIn(southId, "pcs"), 1);
		expect(isHttpError(thrown, 404), String(thrown)).toBe(true);
		expect(await linesOf(quote.id)).toEqual(before);
	});

	test("refuses part of a piece, and adds nothing", async () => {
		const quote = await northOrder("quote");
		const before = await linesOf(quote.id);
		const thrown = await adding(quote.number, await materialIn(northId, "pcs"), 0.5);
		expect(thrown instanceof Refused, String(thrown)).toBe(true);
		expect((thrown as Refused).problems).toMatchObject([{ message: "Whole pieces only" }]);
		expect(await linesOf(quote.id)).toEqual(before);
	});

	test("adds the tenant's material to the order", async () => {
		const quote = await northOrder("quote");
		const material = await materialIn(northId, "pcs");
		const had =
			(await linesOf(quote.id)).find((line) => line.material_id === material)?.quantity ?? 0;
		expect(await adding(quote.number, material, 2)).toBeUndefined();
		expect(await linesOf(quote.id)).toContainEqual({ material_id: material, quantity: had + 2 });
	});
});

test("canTakeLines: an order that isn't invoiced, cancelled or awaiting acceptance", () => {
	expect(orderStatuses.filter((status) => !canTakeLines(status))).toEqual([
		"awaiting_acceptance",
		"invoiced",
		"cancelled",
	]);
});
