/** What the schedule's end-to-end tests share: this week's days, the orders as stored, the board. */
import type { Locator } from "playwright";

import { type App, rows, value, quiet } from "#e2e/app.ts";

// --- This week, in the local time zone the app and the tests share ---------------------------

const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

/** A day of this week (0 is Monday), at a time of day. */
export const weekday = (index: number, hours = 0, minutes = 0) => {
	const date = new Date(monday);
	date.setDate(date.getDate() + index);
	date.setHours(hours, minutes, 0, 0);
	return date;
};
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const longDay = (date: Date) =>
	new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(date);
/** Timestamps are stored in seconds. */
export const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

// --- Months ------------------------------------------------------------------------------------

/** The first of the month `offset` months from this one. */
export const monthStart = (offset = 0) => {
	const date = new Date();
	return new Date(date.getFullYear(), date.getMonth() + offset, 1);
};
/** The 42 days a month's calendar shows: six weeks from the Monday on or before its first. */
export const calendarDays = (first: Date) => {
	const start = new Date(first);
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	return Array.from({ length: 42 }, (_, i) => {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		return date;
	});
};
export const monthName = (date: Date) =>
	new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);

/**
 * The organization's orders on the calendar's days from `from` up to `to` (not included), except
 * cancelled ones, by their day (`yyyy-mm-dd`) in the local time zone.
 */
export async function ordersByDay(organizationId: string, from: Date, to: Date) {
	const found = await rows<{ number: string; scheduled_for: number }>(
		`select number, scheduled_for from "order" where organization_id = ? and status != 'cancelled'
		 and scheduled_for >= ? and scheduled_for < ? order by scheduled_for`,
		[organizationId, seconds(from), seconds(to)],
	);
	const days = new Map<string, string[]>();
	for (const order of found) {
		const key = dayKey(new Date(Number(order.scheduled_for) * 1000));
		days.set(key, [...(days.get(key) ?? []), order.number]);
	}
	return days;
}

// --- Database ----------------------------------------------------------------------------------

export interface Order {
	id: number;
	number: string;
	status: string;
	engineer_id: number | null;
	scheduled_for: number | null;
}

export const orderByNumber = async (number: string, organizationId: string) =>
	(
		await rows<Order>(
			`select id, number, status, engineer_id, scheduled_for from "order"
			 where number = ? and organization_id = ?`,
			[number, organizationId],
		)
	)[0];
/** An order as stored, to check that a refused request changed nothing. */
export const snapshot = (id: number) => rows(`select * from "order" where id = ?`, [id]);
export const scheduledAt = (order: Order) =>
	order.scheduled_for === null ? null : new Date(Number(order.scheduled_for) * 1000);

export const thisWeeksOrders = async (organizationId: string) =>
	Number(
		await value(
			`select count(*) from "order" where organization_id = ? and status != 'cancelled'
			 and scheduled_for >= ? and scheduled_for < ?`,
			[organizationId, seconds(weekday(0)), seconds(weekday(7))],
		),
	);
export const backlogSize = async (organizationId: string) =>
	Number(
		await value(
			`select count(*) from "order" where organization_id = ? and scheduled_for is null
			 and status in ('quote', 'scheduled', 'in_progress')`,
			[organizationId],
		),
	);
export const activeEngineers = (organizationId: string) =>
	rows<{ id: number; name: string }>(
		`select id, name from engineer where organization_id = ? and active = 1 order by name, id`,
		[organizationId],
	);

/**
 * The log entries about switching the schedule on or off in an organization after the activity
 * entry `since`, oldest first.
 */
export const scheduleSwitches = (organizationId: string, since: number) =>
	rows<{ action: string }>(
		`select action from activity where organization_id = ? and subject_type = 'module'
		 and subject_id = 'schedule' and id > ? order by id`,
		[organizationId, since],
	);

// --- Page --------------------------------------------------------------------------------------

/** The board, the sidebar and the settings page's card for the schedule, on `app`'s page. */
export function pageLocators(app: App) {
	const board = () => app.page.locator('section[aria-label="Week"]');
	/** The month's view, and its calendar's cell of a day (on wide screens). */
	const month = () => app.page.locator('section[aria-label="Month"]');
	const monthCell = (day: Date) => month().getByRole("group", { name: longDay(day), exact: true });
	const backlog = () => app.page.getByRole("region", { name: "Backlog" });
	/** The cards on the board (in the view the screen size shows). */
	const cards = (within: Locator) => within.locator("[data-order]:visible");
	const cell = (row: string, day: Date) =>
		app.page.getByRole("group", { name: `${row} on ${longDay(day)}`, exact: true });
	/** The names of the sidebar's links in its first group (Operations), in order. */
	const operations = () =>
		app.page
			.locator('[data-sidebar="group"]')
			.first()
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => link.textContent!.trim()));
	/** The schedule's card on the settings page. */
	const settingsCard = () => app.page.locator('[data-module="schedule"]');

	/** Drags `source` onto `target` and waits for the server's answer to the move. */
	async function drag(source: Locator, target: Locator) {
		const { page } = app;
		const [response] = await Promise.all([
			page.waitForResponse(
				(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
			),
			source.dragTo(target),
		]);
		await quiet(page);
		return response.text();
	}

	/** Opens the schedule dialog for an order on the page. */
	async function openDialog(number: string) {
		await app.page
			.getByRole("button", { name: `Schedule ${number}`, exact: true })
			.first()
			.click();
		const dialog = app.page.getByRole("dialog");
		await dialog.waitFor();
		return dialog;
	}

	return {
		board,
		month,
		monthCell,
		backlog,
		cards,
		cell,
		operations,
		settingsCard,
		drag,
		openDialog,
	};
}
