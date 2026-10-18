/**
 * The schedule's remote functions on the seeded demo database: the week's board (the tenant's
 * engineers, the week's orders but cancelled ones, the backlog of open orders without a date, most
 * urgent first) and the month's six weeks, also for South once it has the module (South's records
 * only); the schedule dialog and a drag and drop move, which plan through core's
 * `scheduleOrder()` (its rules are `src/tests/unit/lib/orders/server/lifecycle.spec.ts`'s), with
 * their refusals: North's order by its id, North's or an inactive engineer, an order that isn't
 * open. The server side of `schedule.test.ts` and `schedule.tenancy.test.ts`, which keep the board.
 */
import type { InStatement } from "@libsql/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { withFirstUnit } from "#lib/orders/server/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { mondayOf, monthRange } from "#modules/schedule/calendar/calendar.ts";
import {
	getSchedule,
	getScheduleMonth,
	moveOrder,
	scheduleOrder,
	watchSchedule,
} from "#modules/schedule/schedule.remote.ts";
import { snapshot } from "#unit/lib/orders/server/order-form.test-support.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const timeZone = "Europe/Amsterdam";
const today = Temporal.Now.plainDateISO(timeZone);

/** The epoch seconds a day starts at, in the seed's time zone. */
const startOf = (day: Temporal.PlainDate) =>
	day.toZonedDateTime({ timeZone }).toInstant().epochMilliseconds / 1000;

/** An organization's orders scheduled on the days `from` to `to`, except cancelled ones. */
const scheduledIn = async (
	organization: string,
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
) =>
	(
		await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status != 'cancelled'
			 and scheduled_for >= ? and scheduled_for < ? order by number`,
			[organization, startOf(from), startOf(to.add({ days: 1 }))],
		)
	).map((row) => row.number);

/** An organization's open orders without a date. */
const backlogOf = async (organization: string) =>
	(
		await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and scheduled_for is null
			 and status in ('quote', 'scheduled', 'in_progress') order by number`,
			[organization],
		)
	).map((row) => row.number);

/** An organization's engineers by name, as the board's rows have them. */
const engineersOf = async (organization: string) =>
	(
		await rows<{ id: number }>(`select id from engineer where organization_id = ? order by name`, [
			organization,
		])
	).map((row) => row.id);

/** A statement's SQL, as the database client gets it. */
const sqlOf = (statement: InStatement) =>
	typeof statement === "string" ? statement : statement.sql;

const numbers = (orders: { number: string }[]) => orders.map((order) => order.number).toSorted();

/** The week's board as `actor` sees it. */
const board = (actor: Actor, day = today) => as(actor, () => data(getSchedule, day.toString()));

describe("North's board", () => {
	test("has its engineers, the week's orders but cancelled ones, and the backlog", async () => {
		const week = await board(north.member);
		const monday = mondayOf(today);
		expect(week.start.equals(monday)).toBe(true);
		expect(week.engineers.map((engineer) => engineer.id)).toEqual(await engineersOf(northId));
		expect(numbers(week.orders)).toEqual(
			await scheduledIn(northId, monday, monday.add({ days: 6 })),
		);
		expect(numbers(week.backlog)).toEqual(await backlogOf(northId));
	});

	test("lists the backlog most urgent first, then oldest first", async () => {
		const { backlog } = await board(north.member);
		const rank = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
		for (const [earlier, later] of backlog.slice(1).map((order, i) => [backlog[i], order])) {
			const [a, b] = [rank[earlier.priority], rank[later.priority]];
			expect(a <= b, `${earlier.number} before ${later.number}`).toBe(true);
			if (a === b) {
				expect(Temporal.Instant.compare(earlier.createdAt, later.createdAt)).toBeLessThanOrEqual(0);
			}
		}
	});

	test("has any day stand for its week", async () => {
		const wednesday = mondayOf(today).add({ days: 9 });
		const week = await board(north.member, wednesday);
		expect(week.start.equals(mondayOf(wednesday))).toBe(true);
	});

	test("its month is six weeks of orders, the days around the month included", async () => {
		const month = await as(north.member, () => data(getScheduleMonth, today.toString()));
		expect(month.month.equals(today.with({ day: 1 }))).toBe(true);
		const range = monthRange(today);
		expect(numbers(month.orders)).toEqual(
			await scheduledIn(
				northId,
				Temporal.PlainDate.from(range.from),
				Temporal.PlainDate.from(range.to),
			),
		);
	});
});

describe("what the board shows of its orders", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("their first unit, how many, and their units' specialties, in one query each", async () => {
		const execute = vi.spyOn(db.$client, "execute");
		const week = await board(north.member);
		const ofUnits = execute.mock.calls.filter(([statement]) =>
			sqlOf(statement).includes(`"order_unit"`),
		);
		// One for the week's orders, one for the backlog.
		expect(ofUnits).toHaveLength(2);
		execute.mockRestore();

		const orders = [...week.orders, ...week.backlog];
		expect(orders.some((order) => order.unitCount > 0)).toBe(true);
		const listed = await as(north.member, () =>
			withFirstUnit(orders.map((order) => ({ id: order.id }))),
		);
		expect(orders.map(({ id, unit, unitCount }) => ({ id, unit, unitCount }))).toEqual(listed);
		for (const order of orders) {
			const specialties = await rows<{ specialty: string | null }>(
				`select category.specialty from order_unit
				 join equipment on equipment.id = order_unit.equipment_id
				 join equipment_category category on category.id = equipment.category_id
				 where order_unit.order_id = ? order by order_unit.position`,
				[order.id],
			);
			expect(order.specialties, order.number).toEqual(specialties.map((row) => row.specialty));
		}
	});
});

describe("the live query's first answer", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	/** Whether a board that read `week` would ask for it again on the live query's first answer. */
	const outdates = async (week: { changedAt: number }) =>
		(await as(north.member, () => data(watchSchedule))) > week.changedAt;

	test("is later than the board's for a change after the read, also in the same millisecond", async () => {
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
		announceChange(northId, "order");
		const week = await board(north.member);
		announceChange(northId, "customer");
		expect(await outdates(week)).toBe(true);
	});

	test("isn't, without a change since the read", async () => {
		const now = Date.now() + 120_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		announceChange(northId, "order");
		vi.spyOn(Date, "now").mockReturnValue(now + 1);
		const week = await board(north.member);
		expect(await outdates(week)).toBe(false);
		// Nor for the month's.
		const month = await as(north.member, () => data(getScheduleMonth, today.toString()));
		expect(await outdates(month)).toBe(false);
	});
});

describe("South, with the schedule switched on", () => {
	beforeAll(async () => {
		await value(`insert into organization_module (organization_id, module_id) values (?, ?)`, [
			southId,
			"schedule",
		]);
	});

	test("sees its own engineers, orders and backlog only", async () => {
		const week = await board(south.owner);
		const monday = mondayOf(today);
		expect(week.engineers.map((engineer) => engineer.id)).toEqual(await engineersOf(southId));
		expect(numbers(week.orders)).toEqual(
			await scheduledIn(southId, monday, monday.add({ days: 6 })),
		);
		expect(numbers(week.backlog)).toEqual(await backlogOf(southId));
		const southOrders = new Set(
			(
				await rows<{ id: number }>(`select id from "order" where organization_id = ?`, [southId])
			).map((row) => row.id),
		);
		for (const order of [...week.orders, ...week.backlog]) {
			expect(southOrders.has(order.id), order.number).toBe(true);
		}
	});

	test("its month shows its own orders, and none of North's", async () => {
		const month = await as(south.owner, () => data(getScheduleMonth, today.toString()));
		const range = monthRange(today);
		const own = await scheduledIn(
			southId,
			Temporal.PlainDate.from(range.from),
			Temporal.PlainDate.from(range.to),
		);
		expect(own.length).toBeGreaterThan(0);
		expect(numbers(month.orders)).toEqual(own);
		for (const order of month.orders) expect(order.customer.id).toBeGreaterThan(0);
		expect(month.engineers.map((engineer) => engineer.id)).toEqual(await engineersOf(southId));
	});

	test("can't schedule or move North's order by its id", async () => {
		const [victim] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' limit 1`,
			[northId],
		);
		const before = await snapshot(victim.id);
		await as(south.owner, async () => {
			const fields = { id: String(victim.id), engineerId: "", day: "2026-11-03", time: "09:00" };
			expect(await submit(scheduleOrder, fields)).toMatchObject({ status: 404 });
			expect(
				await call(moveOrder, {
					id: victim.id,
					engineerId: null,
					day: "2026-11-03",
					time: "09:00",
				}),
			).toMatchObject({ status: 404 });
		});
		expect(await snapshot(victim.id)).toEqual(before);
	});

	test("can't assign North's engineers, nor its own inactive ones", async () => {
		const [own] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' and scheduled_for is null
			 limit 1`,
			[southId],
		);
		const before = await snapshot(own.id);
		const northEngineer = await value<number>(
			`select min(id) from engineer where organization_id = ? and active = 1`,
			[northId],
		);
		const [inactive] = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 0 limit 1`,
			[southId],
		);
		await as(south.owner, async () => {
			const dialog = (engineerId: number) =>
				submit(scheduleOrder, {
					id: String(own.id),
					engineerId: String(engineerId),
					day: "2026-11-03",
					time: "09:00",
				});
			expect((await dialog(northEngineer)).issues).toEqual([
				{ name: "engineerId", path: ["engineerId"], message: "Unknown engineer" },
			]);
			expect((await dialog(inactive.id)).issues).toEqual([
				{
					name: "engineerId",
					path: ["engineerId"],
					message: `${inactive.name} is no longer active`,
				},
			]);
			// A move says so with a 400.
			expect(
				await call(moveOrder, {
					id: own.id,
					engineerId: northEngineer,
					day: "2026-11-03",
					time: "09:00",
				}),
			).toMatchObject({ status: 400, message: "Unknown engineer" });
		});
		expect(await snapshot(own.id)).toEqual(before);
	});
});

describe("the schedule dialog and a move", () => {
	test("refuse an order that isn't open, the dialog on the form", async () => {
		const [done] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'completed' limit 1`,
			[northId],
		);
		const before = await snapshot(done.id);
		await as(north.member, async () => {
			const dialog = await submit(scheduleOrder, {
				id: String(done.id),
				engineerId: "",
				day: "2026-11-03",
				time: "09:00",
			});
			expect(dialog.issues?.map((issue) => issue.message)).toEqual([
				"Only open orders can be scheduled",
			]);
			expect(
				await call(moveOrder, { id: done.id, engineerId: null, day: "2026-11-03", time: "09:00" }),
			).toMatchObject({ status: 400, message: "Only open orders can be scheduled" });
		});
		expect(await snapshot(done.id)).toEqual(before);
	});

	test("plan an open order: the dialog at its time, a move keeping the engineer it's given", async () => {
		const [quote] = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and status = 'quote' and scheduled_for is null
			 order by id desc limit 1`,
			[northId],
		);
		const engineerId = await value<number>(
			`select min(id) from engineer where organization_id = ? and active = 1`,
			[northId],
		);
		await as(north.member, async () => {
			const dialog = await submit(scheduleOrder, {
				id: String(quote.id),
				engineerId: String(engineerId),
				day: "2026-11-03",
				time: "13:30",
			});
			expect(dialog).toMatchObject({ status: 200 });
			const moved = await call(moveOrder, {
				id: quote.id,
				engineerId: null,
				day: "2026-11-05",
				time: "13:30",
			});
			expect(moved).toMatchObject({ status: 200 });
		});
		const [stored] = await rows<{ status: string; engineer_id: number | null; at: number }>(
			`select status, engineer_id, scheduled_for as at from "order" where id = ?`,
			[quote.id],
		);
		// Scheduled stays scheduled, unassigned again.
		expect(stored).toEqual({
			status: "scheduled",
			engineer_id: null,
			at:
				Temporal.PlainDate.from("2026-11-05")
					.toZonedDateTime({ timeZone, plainTime: "13:30" })
					.toInstant().epochMilliseconds / 1000,
		});
	});
});
