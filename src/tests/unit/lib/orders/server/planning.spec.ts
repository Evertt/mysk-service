/**
 * Planning an order (`transitionOrder()`'s `plan`, which the schedule module's board and dialog
 * plan with) on the seeded demo database, with the real modules: in the planner's time zone; a
 * quote that gets an engineer is scheduled and takes its materials, one without stays a quote; a
 * module's refusal stores nothing; logged. Its rules and refusals are `lifecycle.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { type OrderPlan, transitionOrder } from "#lib/orders/server/index.ts";
import { db } from "#lib/server/db/index.ts";
import { Refused } from "#lib/server/refused.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";

import { snapshot } from "./order-form.test-support.ts";

const northId = organizationId("north");

/** Plans an order as `actor` (North's planner), in a transaction, as the board does. */
const plan = (input: Omit<OrderPlan, "day"> & { day: string }, actor: Actor = north.member) =>
	as(actor, () =>
		db.transaction((tx) =>
			transitionOrder(tx, { verb: "plan", ...input, day: Temporal.PlainDate.from(input.day) }),
		),
	);

/** An order of an organization in `status`, with or without material lines. */
const orderIn = async (organization: string, status: string, withLines = false) =>
	(
		await rows<{ id: number; number: string }>(
			`select id, number from "order" o where organization_id = ? and status = ?
			 and ${withLines ? "" : "not "}exists (select 1 from order_line l where l.order_id = o.id)
			 and scheduled_for is null order by id limit 1`,
			[organization, status],
		)
	)[0];

/** An active engineer of an organization. */
const activeEngineer = (organization: string) =>
	value<number>(`select min(id) from engineer where organization_id = ? and active = 1`, [
		organization,
	]);

/** When an order is scheduled for, as stored (epoch seconds). */
const scheduledFor = (id: number) =>
	value<number>(`select scheduled_for from "order" where id = ?`, [id]);

/** An order's consumption of materials, by material. */
const consumed = (id: number) =>
	rows(
		`select material_id, -sum(quantity) as quantity from stock_movement
		 where order_id = ? and kind = 'consumption' group by material_id order by material_id`,
		[id],
	);

/** An instant's epoch seconds, of a day and time in a time zone. */
const seconds = (day: string, time: string, timeZone = "Europe/Amsterdam") =>
	Temporal.PlainDate.from(day).toZonedDateTime({ timeZone, plainTime: time }).epochMilliseconds /
	1000;

describe("planning an order", () => {
	test("a quote that gets an engineer is scheduled then, and takes its materials; logged", async () => {
		const quote = await orderIn(northId, "quote", true);
		const engineerId = await activeEngineer(northId);
		expect(await consumed(quote.id)).toEqual([]);

		expect(await plan({ id: quote.id, engineerId, day: "2026-11-03", time: "13:30" })).toEqual({
			id: quote.id,
			number: quote.number,
		});
		const [stored] = await rows<{ status: string; engineer_id: number }>(
			`select status, engineer_id from "order" where id = ?`,
			[quote.id],
		);
		expect(stored).toEqual({ status: "scheduled", engineer_id: engineerId });
		expect(await scheduledFor(quote.id)).toBe(seconds("2026-11-03", "13:30"));
		expect(await consumed(quote.id)).toEqual(
			await rows(
				`select material_id, sum(quantity) as quantity from order_line where order_id = ?
				 group by material_id order by material_id`,
				[quote.id],
			),
		);
		const [entry] = await rows<{ action: string; changes: string; user: string }>(
			`select a.action, a.changes, u.email as user from activity a join user u on u.id = a.user_id
			 where a.subject_type = 'order' and a.subject_id = ? order by a.id desc limit 1`,
			[String(quote.id)],
		);
		expect(entry).toMatchObject({ action: "scheduled", user: north.member.email });
		expect(JSON.parse(entry.changes)).toMatchObject({
			status: ["quote", "scheduled"],
			engineerId: [null, engineerId],
		});
	});

	test("a quote without an engineer stays a quote, and takes nothing", async () => {
		const quote = await orderIn(northId, "quote", true);
		await plan({ id: quote.id, engineerId: null, day: "2026-11-04", time: "09:00" });
		expect(await value(`select status from "order" where id = ?`, [quote.id])).toBe("quote");
		expect(await scheduledFor(quote.id)).toBe(seconds("2026-11-04", "09:00"));
		expect(await consumed(quote.id)).toEqual([]);
	});

	test("is at the time of day in the planner's time zone", async () => {
		const quote = await orderIn(northId, "quote");
		await as(
			north.member,
			() =>
				db.transaction((tx) =>
					transitionOrder(tx, {
						verb: "plan",
						id: quote.id,
						engineerId: null,
						day: Temporal.PlainDate.from("2026-11-05"),
						time: "09:00",
					}),
				),
			{ timeZone: "Europe/London" },
		);
		expect(await scheduledFor(quote.id)).toBe(seconds("2026-11-05", "09:00", "Europe/London"));
	});

	test("stores nothing when a module refuses it: too few in stock", async () => {
		const quote = await orderIn(northId, "quote", true);
		const before = await snapshot(quote.id);
		const [line] = await rows<{ material_id: number }>(
			`select material_id from order_line where order_id = ? limit 1`,
			[quote.id],
		);
		const stock = await value<number>(`select stock from material where id = ?`, [
			line.material_id,
		]);
		await value(`update material set stock = 0 where id = ?`, [line.material_id]);
		try {
			const thrown = await plan({
				id: quote.id,
				engineerId: await activeEngineer(northId),
				day: "2026-11-03",
				time: "09:00",
			}).catch((error: unknown) => error);
			expect(thrown instanceof Refused).toBe(true);
			expect(thrown instanceof Refused && thrown.problems[0].message).toMatch(/in stock/);
			expect(await snapshot(quote.id)).toEqual(before);
			expect(await consumed(quote.id)).toEqual([]);
		} finally {
			await value(`update material set stock = ? where id = ?`, [stock, line.material_id]);
		}
	});
});
