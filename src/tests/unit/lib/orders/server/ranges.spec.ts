/**
 * The orders list's range filters on the seeded demo database, as a link to the list asks for
 * them (`?created=last-30-days`, `?scheduled=this-week..next-month`, `?total=500..`): what
 * `getOrders` counts for the dates' ranges and presets, open ends and `none`, and for the totals as
 * priced with the tenant's modules; South's only South's; and the schema's refusals. The server side
 * of `src/tests/e2e/orders.ranges.test.ts`, which keeps the Filter menu.
 */
import { describe, expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { type DateRange, presetRange } from "#lib/components/data-table/ranges.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { getOrders } from "#lib/orders/list/order-list.remote.ts";
import { ordersList } from "#lib/orders/list/orders-list.ts";
import { type Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The harness's visitors' time zone, the seed's, in which a range's days start. */
const zone = "Europe/Amsterdam";
const today = () => Temporal.Now.plainDateISO(zone);

/** A range of days in SQL: from the first day's start, before the start of the day after the last. */
const bounds = ({ from, to }: DateRange) => {
	const start = (day: Temporal.PlainDate) => day.toZonedDateTime(zone).epochMilliseconds / 1000;
	return [
		from === null ? -1e12 : start(Temporal.PlainDate.from(from)),
		to === null ? 1e12 : start(Temporal.PlainDate.from(to).add({ days: 1 })),
	];
};

/** How many of an organization's orders have `column` (a date) in a range of days. */
const countIn = async (column: string, range: DateRange, organization = northId, and = "") =>
	Number(
		await value(
			`select count(*) from "order" where organization_id = ? and ${column} >= ? and ${column} < ? ${and}`,
			[organization, ...bounds(range)],
		),
	);

const count = async (sql: string, args: string[] = []) => Number(await value(sql, args));

/** The first page of the list a link with `search` opens, as `actor` (North's planner). */
const opened = (search: string, actor: Actor = north.member) =>
	as(actor, () =>
		data(
			getOrders,
			toListQuery(ordersList, parseTableUrl(new URLSearchParams(search), ordersList.urlSpec)),
		),
	);

/** How many orders a link with `search` lists. */
const shownFor = async (search: string, actor?: Actor) => (await opened(search, actor)).rowCount;

describe("the dates' ranges, in North", () => {
	test("a preset, several values and days of one's own", async () => {
		const soon = await countIn("scheduled_for", presetRange("next-7-days", today()));
		expect(soon).toBeGreaterThan(0);
		expect(await shownFor("scheduled=next-7-days")).toBe(soon);
		const unscheduled = await count(
			`select count(*) from "order" where organization_id = ? and scheduled_for is null`,
			[northId],
		);
		expect(unscheduled).toBeGreaterThan(0);
		expect(await shownFor("scheduled=none,next-7-days")).toBe(unscheduled + soon);

		const range = {
			from: today().subtract({ days: 20 }).toString(),
			to: today().subtract({ days: 6 }).toString(),
		};
		const inRange = await countIn("scheduled_for", range);
		expect(inRange).toBeGreaterThan(0);
		expect(await shownFor(`scheduled=${range.from}..${range.to}`)).toBe(inRange);
		expect(await shownFor("scheduled=today..")).toBe(
			await countIn("scheduled_for", { from: today().toString(), to: null }),
		);
	});

	test("combine with the other filters, with either end open", async () => {
		const lastMonth = presetRange("last-30-days", today());
		expect(await shownFor("created=last-30-days&status=quote")).toBe(
			await countIn("created_at", lastMonth, northId, "and status = 'quote'"),
		);
		const since = today().subtract({ days: 10 }).toString();
		expect(await shownFor(`scheduled=${since}..`)).toBe(
			await countIn("scheduled_for", { from: since, to: null }),
		);
		// Unscheduled orders are in no range.
		expect(await shownFor("scheduled=..2100-01-01")).toBe(
			await count(
				`select count(*) from "order" where organization_id = ? and scheduled_for is not null`,
				[northId],
			),
		);
		// Presets as ends.
		const [thisWeek, nextMonth] = [
			presetRange("this-week", today()),
			presetRange("next-month", today()),
		];
		expect(await shownFor("scheduled=this-week..next-month")).toBe(
			await countIn("scheduled_for", { from: thisWeek.from, to: nextMonth.to }),
		);
		expect(await shownFor("scheduled=..yesterday,none")).toBe(
			(await countIn("scheduled_for", presetRange("before-today", today()))) +
				(await count(
					`select count(*) from "order" where organization_id = ? and scheduled_for is null`,
					[northId],
				)),
		);
	});
});

describe("the totals, in euros as priced with the tenant's modules", () => {
	test("keep the orders in range, to the cent, also with the other filters and several ranges", async () => {
		const all = await count(`select count(*) from "order" where organization_id = ?`, [northId]);
		const over = await opened("total=500..");
		expect(over.rowCount).toBeGreaterThan(0);
		for (const row of over.rows) expect(row.total).toBeGreaterThanOrEqual(50_000);
		const under = await opened("total=..499.99");
		expect(under.rowCount).toBeGreaterThan(0);
		for (const row of under.rows) expect(row.total).toBeLessThanOrEqual(49_999);
		expect(over.rowCount + under.rowCount).toBe(all);

		const completed = await count(
			`select count(*) from "order" where organization_id = ? and status = 'completed'`,
			[northId],
		);
		expect(
			(await shownFor("total=500..&status=completed")) +
				(await shownFor("total=..499.99&status=completed")),
		).toBe(completed);
		expect(await shownFor("total=..100,500..")).toBe(
			over.rowCount + (await shownFor("total=..100")),
		);
	});
});

describe("in South", () => {
	test("the ranges count South's orders only", async () => {
		const range = presetRange("last-30-days", today());
		const expected = await countIn("created_at", range, southId);
		expect(expected).toBeGreaterThan(0);
		const shown = await opened("created=last-30-days", south.owner);
		expect(shown.rowCount).toBe(expected);
		const numbers = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and created_at >= ? and created_at < ?
			 order by created_at desc, id limit 50`,
			[southId, ...bounds(range)],
		);
		expect(shown.rows.map((row) => row.number)).toEqual(numbers.map((row) => row.number));
		const southOrders = await count(`select count(*) from "order" where organization_id = ?`, [
			southId,
		]);
		expect(
			(await shownFor("total=500..", south.owner)) +
				(await shownFor("total=..499.99", south.owner)),
		).toBe(southOrders);
	});
});

describe("a malformed range in the list's query is refused with a 400", () => {
	// The creation date can't be empty, and a range of cents isn't a token. The schema's other
	// refusals are `list-definition.spec.ts`'s.
	test.each<Record<string, unknown>>([{ createdAt: [null] }, { total: ["500.."] }])(
		"%j",
		async (filters) => {
			const query = {
				...toListQuery(ordersList, parseTableUrl(new URLSearchParams(), ordersList.urlSpec)),
				filters,
			};
			expect(await as(north.member, () => call(getOrders, query as never))).toMatchObject({
				status: 400,
				message: "Bad Request",
			});
		},
	);
});
