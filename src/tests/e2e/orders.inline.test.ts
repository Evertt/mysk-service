/**
 * The orders list's status cell: choosing a status (by mouse, keyboard and on a phone) changes the
 * order and logs it, an invoiced order's can only filter, and a refusal shows why and puts the
 * status back. What `setOrderStatus` refuses (an invoiced order, a status not given by hand,
 * another tenant's order) is `orders/server/changes.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	fitsWidth,
	isRemote,
	mobileViewport,
	onPhone,
	organizations,
	quiet,
	rows,
	unbalancedStock,
	useApp,
	value,
} from "./app.ts";
import { snapshot } from "./orders-helpers.ts";
import { remoteErrorStatus, tamperWithCommand } from "./remote-functions.ts";

const { north } = organizations;
const app = useApp();

/** An order of an organization's with `status` (the last by number). */
const orderWith = async (organizationId: string, status: string) =>
	(
		await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? and status = ?
			 order by number desc limit 1`,
			[organizationId, status],
		)
	)[0];
const statusOf = (id: number) => value<string>(`select status from "order" where id = ?`, [id]);
/** The activity logged for an order, newest first. */
const activityOf = (id: number) =>
	rows<{ action: string; changes: string | null }>(
		`select action, changes from activity where subject_type = 'order' and subject_id = ?
		 order by id desc`,
		[String(id)],
	);

/** The status select (or badge) in the row of the order `number`. */
const statusIn = (number: string) =>
	app.page
		.locator('[data-slot="data-table"] tbody tr', { hasText: number })
		.locator('[data-column-id="status"]');
/** The status select of the order `number`, showing `label`. */
const select = (number: string, label: string) =>
	statusIn(number).getByRole("button", { name: `Change status of ${number}: ${label}` });

describe("changing an order's status in the list, in North", () => {
	let order: { id: number; number: string };

	test("choosing another status changes the order and logs it", async () => {
		const { page } = app;
		order = await orderWith(north.id, "quote");
		await app.go(`/orders?q=${order.number}`);
		await select(order.number, "Quote").click();
		// Every status that can be given by hand, its own among them; not invoiced.
		const options = page.getByRole("option");
		await options.first().waitFor();
		expect(await options.allInnerTexts()).toEqual([
			"Quote",
			"Scheduled",
			"In progress",
			"Completed",
			"Cancelled",
		]);
		await page.getByRole("option", { name: "Scheduled" }).click();

		await select(order.number, "Scheduled").waitFor();
		await expect.poll(() => statusOf(order.id)).toBe("scheduled");
		// Its answer, with the refreshed rows, is in.
		await quiet(page);
		const [latest] = await activityOf(order.id);
		expect(latest.action).toBe("updated");
		expect(JSON.parse(latest.changes!)).toEqual({ status: ["quote", "scheduled"] });
	});

	test("it works with the keyboard, without moving the row's focus", async () => {
		const { page } = app;
		const trigger = select(order.number, "Scheduled");
		await trigger.focus();
		await page.keyboard.press("Enter");
		await page.getByRole("option", { name: "Scheduled" }).waitFor();
		// From the current status to the next.
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");

		await select(order.number, "In progress").waitFor();
		await expect.poll(() => statusOf(order.id)).toBe("in_progress");
		// Its answer, with the refreshed rows, is in.
		await quiet(page);
		// The focus is back on the select, not on a row.
		expect(
			await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""),
		).toBe(`Change status of ${order.number}: In progress`);
		expect(await unbalancedStock(north.id)).toEqual([]);
	});

	test("on a phone, a tap opens the statuses on the screen", async () => {
		const { page } = app;
		await onPhone(page, async () => {
			await select(order.number, "In progress").click();
			const option = page.getByRole("option", { name: "Completed" });
			await option.waitFor();
			const box = (await option.boundingBox())!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(mobileViewport.width);
			expect(await fitsWidth(page)).toBe(true);
			// Closed without choosing, nothing changes.
			await page.keyboard.press("Escape");
			await option.waitFor({ state: "detached" });
		});
		expect(await statusOf(order.id)).toBe("in_progress");
	});

	test("an invoiced order's status can't be changed, only filtered by", async () => {
		const invoiced = await orderWith(north.id, "invoiced");
		await app.go(`/orders?q=${invoiced.number}`);
		await statusIn(invoiced.number).getByText("Invoiced").waitFor();
		const buttons = statusIn(invoiced.number).getByRole("button");
		expect(await buttons.count()).toBe(1);
		expect(await buttons.getAttribute("aria-label")).toBe("Filter by Invoiced");
	});

	test("a change the server refuses shows why, and the status goes back", async () => {
		const { page } = app;
		const quote = await orderWith(north.id, "quote");
		const invoiced = await orderWith(north.id, "invoiced");
		const before = [await snapshot(quote.id), await snapshot(invoiced.id)];
		await app.go(`/orders?q=${quote.number}`);
		await select(quote.number, "Quote").click();
		// Sent for an invoiced order instead, which can't be changed.
		await tamperWithCommand<{ id: number }>(page, "setOrderStatus", (arg) => ({
			...arg,
			id: invoiced.id,
		}));
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "setOrderStatus")),
				page.getByRole("option", { name: "Cancelled" }).click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(400);
		// Found also once it's gone, as after a wait for the network that outlasted it (`toasts.ts`):
		// closed here first, as soon as the page's record of its toasts has it.
		const shown = (
			await page.waitForFunction(
				() => {
					const log = window.__e2eToasts;
					return log && log.shown.length > log.from ? log.elements[log.from] : undefined;
				},
				undefined,
				{ polling: 100 },
			)
		).asElement()!;
		await shown.evaluate((toast) =>
			toast.isConnected
				? toast.querySelector<HTMLElement>("[data-close-button]")?.click()
				: undefined,
		);
		await page.waitForFunction((toast) => !toast.isConnected, shown, { polling: 100 });
		await app.toast(`${invoiced.number} is invoiced`);
		await select(quote.number, "Quote").waitFor();
		expect([await snapshot(quote.id), await snapshot(invoiced.id)]).toEqual(before);
	});
});
