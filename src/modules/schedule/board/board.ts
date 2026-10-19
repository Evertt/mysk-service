/**
 * Week maths and grouping for the dispatch board. Days are `Temporal.PlainDate`s, an order's the
 * day of its moment in the user's time zone, and weeks run Monday to Sunday.
 */
import { dayOf, isDay } from "#lib/dates.ts";
import { dateFormatter, formatDate } from "#lib/i18n/index.ts";
import { type OrderPriority, orderPriorities, type OrderStatus } from "#lib/models.ts";
import { plannedStatus } from "#lib/orders/index.ts";

import type { getSchedule } from "../schedule.remote.ts";

/** What the schedule query returns for a week, and one of its orders. */
export type Schedule = Awaited<ReturnType<typeof getSchedule>>;
export type ScheduleOrder = Schedule["orders"][number];

/** When an order from the backlog is planned, unless another time is chosen. */
export const DEFAULT_TIME = "09:00";

/** Orders per engineer per day before the day counts as full; more is over-booked. */
const DAILY_CAPACITY = 3;

/** The day `value` (`yyyy-mm-dd`, as in the `?week=` search param) stands for, if it's one. */
export const parseDay = (value: string | null | undefined) =>
	isDay(value) ? Temporal.PlainDate.from(value) : undefined;

/** The seven days of the week starting at `start`. */
export const weekDays = (start: Temporal.PlainDate) =>
	Array.from({ length: 7 }, (_, i) => start.add({ days: i }));

const shortDay = dateFormatter({ weekday: "short", day: "numeric", month: "short" });
const longDay = dateFormatter({ weekday: "long", day: "numeric", month: "long" });

/** A day in a column header, e.g. `Mon 5 Oct` (in Dutch `ma 5 okt`). */
export const formatDay = (day: Temporal.PlainDate) => shortDay(day);

/** A day in full, e.g. `Monday 5 October` (in Dutch `maandag 5 oktober`). */
export const formatLongDay = (day: Temporal.PlainDate) => longDay(day);

/** The week starting at `start`, e.g. `5–11 Oct 2026`. */
export const formatWeek = (start: Temporal.PlainDate) =>
	formatDate.range(start, start.add({ days: 6 }));

/** An engineer's row on the board, or the unassigned orders' row. */
export type RowId = number | "unassigned";

/** A row's heading on the board, and whether orders can be dropped on it. */
export interface BoardRow {
	id: RowId;
	name: string;
	detail: string;
	droppable: boolean;
}

/** Identifies a cell of the board: a row on a day. */
export const cellKey = (row: RowId, day: Temporal.PlainDate) => `${row}/${day.toString()}`;

interface Placed {
	engineerId: number | null;
	scheduledFor: Temporal.Instant | null;
}

/**
 * Orders by the cell they're in, each cell sorted by time. Orders without a date are left out, and
 * orders of an engineer who isn't on the board (`rows`) count as unassigned.
 */
export function groupByCell<T extends Placed>(orders: T[], rows: RowId[]) {
	const known = new Set(rows);
	const cells = new Map<string, T[]>();
	for (const order of orders) {
		if (!order.scheduledFor) continue;
		const row =
			order.engineerId !== null && known.has(order.engineerId) ? order.engineerId : "unassigned";
		const key = cellKey(row, dayOf(order.scheduledFor));
		cells.set(key, [...(cells.get(key) ?? []), order]);
	}
	for (const cell of cells.values()) {
		cell.sort((a, b) => Temporal.Instant.compare(a.scheduledFor!, b.scheduledFor!));
	}
	return cells;
}

/**
 * The engineers that get a row on the board showing `days`: the active ones, and inactive ones who
 * still have orders on those days (so those don't go missing), in the given order.
 */
export const boardEngineers = <E extends { id: number; active: boolean }>(
	engineers: E[],
	orders: Placed[],
	days: Temporal.PlainDate[],
) => {
	const shown = new Set(days.map(String));
	const busy = new Set(
		orders
			.filter((order) => shown.has(String(order.scheduledFor && dayOf(order.scheduledFor))))
			.map((order) => order.engineerId),
	);
	return engineers.filter((engineer) => engineer.active || busy.has(engineer.id));
};

/** How booked a cell is, for its load indicator. */
export type Load = "none" | "normal" | "full" | "over";

export function load(count: number, capacity = DAILY_CAPACITY): Load {
	if (count === 0) return "none";
	if (count < capacity) return "normal";
	return count === capacity ? "full" : "over";
}

const priorityRank = (priority: OrderPriority) => orderPriorities.indexOf(priority);

/** Backlog order: most urgent first, then the longest waiting. */
export const byPriorityThenAge = (
	a: { priority: OrderPriority; createdAt: Temporal.Instant },
	b: { priority: OrderPriority; createdAt: Temporal.Instant },
) =>
	priorityRank(b.priority) - priorityRank(a.priority) ||
	Temporal.Instant.compare(a.createdAt, b.createdAt);

interface Movable extends Placed {
	id: number;
	status: OrderStatus;
}

/**
 * The board's data after an order moved to `engineerId` at `scheduledFor`, for showing a move
 * before the server confirms it: the order leaves the backlog, and stays on the board only if it's
 * still in the week starting at `start`.
 */
export function applyMove<
	O extends Movable,
	S extends { start: Temporal.PlainDate; orders: O[]; backlog: O[] },
>(schedule: S, move: { id: number; engineerId: number | null; scheduledFor: Temporal.Instant }): S {
	const order =
		schedule.orders.find((o) => o.id === move.id) ?? schedule.backlog.find((o) => o.id === move.id);
	if (!order) return schedule;
	const moved = {
		...order,
		engineerId: move.engineerId,
		scheduledFor: move.scheduledFor,
		status: plannedStatus(order.status, move.engineerId),
	};
	const day = dayOf(move.scheduledFor);
	const inWeek =
		Temporal.PlainDate.compare(day, schedule.start) >= 0 &&
		Temporal.PlainDate.compare(day, schedule.start.add({ days: 7 })) < 0;
	return {
		...schedule,
		orders: [...schedule.orders.filter((o) => o.id !== move.id), ...(inWeek ? [moved] : [])],
		backlog: schedule.backlog.filter((o) => o.id !== move.id),
	};
}
