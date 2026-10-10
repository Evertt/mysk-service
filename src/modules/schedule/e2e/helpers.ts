/** What the schedule's end-to-end tests share: this week's days, the orders as stored, the board. */
import type { Locator } from "playwright";

import { type App, rows, value } from "#e2e/app.ts";

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
	/** The schedule's card on the settings page (by its name: other cards may mention schedules). */
	const settingsCard = () =>
		app.page
			.locator("div.rounded-lg.border")
			.filter({ has: app.page.getByText("Schedule", { exact: true }) });

	/** Drags `source` onto `target` and waits for the server's answer to the move. */
	async function drag(source: Locator, target: Locator) {
		const { page } = app;
		const [response] = await Promise.all([
			page.waitForResponse(
				(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
			),
			source.dragTo(target),
		]);
		await page.waitForLoadState("networkidle");
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

	return { board, backlog, cards, cell, operations, settingsCard, drag, openDialog };
}
