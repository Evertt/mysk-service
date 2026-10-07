/**
 * Week maths and grouping for the dispatch board. Days are local days, like the dates entered in
 * the order form (see `#lib/schema.ts`), and weeks run Monday to Sunday.
 */
import { type OrderPriority, orderPriorities, type OrderStatus } from "#lib/models.js";
import { toDateInput } from "#lib/schema.js";

/** When an order from the backlog is planned, unless another time is chosen. */
export const DEFAULT_TIME = "09:00";

/** Orders per engineer per day before the day counts as full; more is over-booked. */
export const DAILY_CAPACITY = 3;

/** A day as `yyyy-mm-dd`, as in the `?week=` search param and `<input type="date">`. */
export const dayKey = (date: Date) => toDateInput(date);

/** The local start of the day `value` (`yyyy-mm-dd`) stands for, if it's a day on the calendar. */
export function parseDay(value: string | null | undefined): Date | undefined {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
	if (!match) return undefined;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

/** `date` plus a number of calendar days, keeping the time of day across daylight saving. */
export function addDays(date: Date, days: number) {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/** The Monday of the week `date` falls in, at the start of the day. */
export function startOfWeek(date: Date) {
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return addDays(day, -((day.getDay() + 6) % 7));
}

/** The week a `?week=` search param stands for: the week of that day, or else this week. */
export const weekFromParam = (param: string | null | undefined, today = new Date()) =>
	startOfWeek(parseDay(param) ?? today);

/** The seven days of the week starting at `start`. */
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** The ISO 8601 week number: weeks start on Monday, and week 1 has the year's first Thursday. */
export function weekNumber(date: Date) {
	const thursday = addDays(startOfWeek(date), 3);
	const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
	return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const shortDay = new Intl.DateTimeFormat("en-GB", {
	weekday: "short",
	day: "numeric",
	month: "short",
});
const longDay = new Intl.DateTimeFormat("en-GB", {
	weekday: "long",
	day: "numeric",
	month: "long",
});
const range = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

/** A day in a column header, e.g. `Mon 5 Oct`. */
export const formatDay = (day: Date) => shortDay.format(day);

/** A day in full, e.g. `Monday 5 October`. */
export const formatLongDay = (day: Date) => longDay.format(day);

/** The week starting at `start`, e.g. `5–11 Oct 2026`. */
export const formatWeek = (start: Date) => range.formatRange(start, addDays(start, 6));

const pad = (value: number) => String(value).padStart(2, "0");

/** The time of day as `HH:MM`, as in `<input type="time">`. */
export const timeOfDay = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** `day` at `time` (`HH:MM`). */
export function atTime(day: Date, time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	const result = new Date(day);
	result.setHours(hours, minutes, 0, 0);
	return result;
}

/** An engineer's row on the board, or the unassigned orders' row. */
export type RowId = number | "unassigned";

/** Identifies a cell of the board: a row on a day. */
export const cellKey = (row: RowId, day: Date) => `${row}/${dayKey(day)}`;

interface Placed {
	engineerId: number | null;
	scheduledFor: Date | null;
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
		const key = cellKey(row, order.scheduledFor);
		cells.set(key, [...(cells.get(key) ?? []), order]);
	}
	for (const cell of cells.values()) {
		cell.sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());
	}
	return cells;
}

/**
 * The engineers that get a row: the active ones, and inactive ones who still have orders in the
 * week (so those don't go missing), in the given order.
 */
export const boardEngineers = <E extends { id: number; active: boolean }>(
	engineers: E[],
	orders: Placed[],
) => {
	const busy = new Set(orders.map((order) => order.engineerId));
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
	a: { priority: OrderPriority; createdAt: Date },
	b: { priority: OrderPriority; createdAt: Date },
) =>
	priorityRank(b.priority) - priorityRank(a.priority) ||
	a.createdAt.getTime() - b.createdAt.getTime();

/**
 * The status an open order gets when it's planned: a quote that gets an engineer and a date is
 * scheduled (as in the seed data, where quotes have neither); other statuses stay as they are.
 */
export const plannedStatus = (status: OrderStatus, engineerId: number | null): OrderStatus =>
	status === "quote" && engineerId !== null ? "scheduled" : status;

interface Movable extends Placed {
	id: number;
	status: OrderStatus;
}

/**
 * The board's data after an order moved to `engineerId` at `scheduledFor`, for showing a move
 * before the server confirms it: the order leaves the backlog, and stays on the board only if it's
 * still in the week starting at `start`.
 */
export function applyMove<O extends Movable, S extends { start: Date; orders: O[]; backlog: O[] }>(
	schedule: S,
	move: { id: number; engineerId: number | null; scheduledFor: Date },
): S {
	const order =
		schedule.orders.find((o) => o.id === move.id) ?? schedule.backlog.find((o) => o.id === move.id);
	if (!order) return schedule;
	const moved = {
		...order,
		engineerId: move.engineerId,
		scheduledFor: move.scheduledFor,
		status: plannedStatus(order.status, move.engineerId),
	};
	const end = addDays(schedule.start, 7);
	const inWeek = move.scheduledFor >= schedule.start && move.scheduledFor < end;
	return {
		...schedule,
		orders: [...schedule.orders.filter((o) => o.id !== move.id), ...(inWeek ? [moved] : [])],
		backlog: schedule.backlog.filter((o) => o.id !== move.id),
	};
}
