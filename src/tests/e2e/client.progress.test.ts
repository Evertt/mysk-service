/**
 * A customer following a breakdown they reported, in SHLTR's customer portal: the order page's
 * timeline (received, engineer scheduled, engineer on the way, resolved) and the bell in the portal's
 * header, as the planner accepts and plans it and the engineer sets out, and the mail the reporter
 * gets of each change. Which changes ring whose bell, the mail's language and the isolation between
 * customers and tenants are in the server spec
 * (`src/tests/unit/lib/server/notifications/customer-notifications.spec.ts`).
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { baseURL, hydrated, organizations, rows, useApp, users, value } from "./app.ts";
import { sentMail } from "./mail.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.riedel });

const bell = (page: Page) => page.locator("[data-notification-bell]");
const dot = (page: Page) => page.locator("[data-notification-dot]");

/** Each timeline step as `key:state`, in order. */
const steps = () =>
	app.page
		.locator("[data-order-timeline] [data-step]")
		.evaluateAll((items) =>
			items.map((item) => `${item.getAttribute("data-step")}:${item.getAttribute("data-state")}`),
		);

/** Opens the bell's tray, runs `steps` on it, and closes it. */
async function readTray(page: Page, steps: () => Promise<void> = async () => {}) {
	await bell(page).click();
	await page
		.locator('[data-notification-tray][aria-busy="false"] :is(li, [data-slot=empty])')
		.first()
		.waitFor();
	await steps();
	await page.keyboard.press("Escape");
	await page.locator("[data-notification-tray]").waitFor({ state: "detached" });
}

/** Runs `steps` on a page of `email`'s own, then closes it. */
async function asOther(email: string, steps: (page: Page) => Promise<void>) {
	const { page } = await signedInPage(app, email);
	try {
		await steps(page);
	} finally {
		await page.context().close();
	}
}

describe("following a reported breakdown", () => {
	let order: { id: number; number: string };

	test("a report starts its timeline: received by SHLTR, the rest to come", async () => {
		await app.go("/portal");
		// What the seed left unread is seen first.
		await readTray(app.page);
		await app.go("/portal/report");
		const unit = app.page.getByLabel("Unit");
		const [choice] = await unit
			.locator("option:not([value=''])")
			.evaluateAll((options) =>
				options.slice(0, 1).map((option) => (option as HTMLOptionElement).value),
			);
		await unit.selectOption(choice);
		await app.page.getByLabel("Description").fill("Overheaddeur dock 2 piept bij het openen.");
		await app.page
			.getByRole("group", { name: "Urgency" })
			.getByRole("button", { name: "Standstill" })
			.click();
		await app.page.getByRole("button", { name: "Send report" }).click();
		await app.page.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
		[order] = await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? order by id desc limit 1`,
			[shltr.id],
		);
		await app.page.locator("[data-order-timeline]").waitFor();
		expect(await steps()).toEqual([
			"received:done",
			"scheduled:upcoming",
			"on_the_way:upcoming",
			"resolved:upcoming",
		]);
		const timeline = await app.page.locator("[data-order-timeline]").innerText();
		expect(timeline).toContain("Received by SHLTR");
		expect(timeline).toContain("Waiting for SHLTR to accept it");
		// The mails about it go out in the language it was reported in.
		expect(
			await value(`select reporter_locale from order_request where order_id = ?`, [order.id]),
		).toBe("en");
	});

	test("accepted and planned at once: the timeline and the bell follow, and one mail", async () => {
		const before = sentMail(users.riedel).length;
		await asOther(users.shltrPlanner, async (planner) => {
			await planner.goto(`${baseURL}/orders/${order.number}`);
			await hydrated(planner);
			await planner.getByRole("button", { name: "Accept" }).click();
			const dialog = planner.getByRole("dialog");
			await dialog.getByLabel("Engineer").selectOption({ label: "Lev Hoekstra" });
			await dialog.getByLabel("Day").fill(Temporal.Now.plainDateISO().add({ days: 1 }).toString());
			await dialog.getByLabel("Time").fill("09:30");
			await dialog.getByRole("button", { name: "Accept" }).click();
			await planner.locator('[data-decision="accepted"]').waitFor();
		});
		// Live, without a reload.
		await expect
			.poll(steps)
			.toEqual(["received:done", "scheduled:done", "on_the_way:upcoming", "resolved:upcoming"]);
		const timeline = await app.page.locator("[data-order-timeline]").innerText();
		expect(timeline).toContain("Planned for");
		expect(timeline).toContain("Engineer: Lev");
		await dot(app.page).waitFor();
		await readTray(app.page, async () => {
			const entries = app.page.locator("[data-notification][data-unread]");
			await expect.poll(() => entries.count()).toBe(2);
			const text = await app.page.locator("[data-notification-tray]").innerText();
			expect(text).toContain("Accepted");
			expect(text).toContain("Planned or moved");
			// By the company, not the planner; linked to its page in the portal.
			expect(text).not.toContain("Jan Weggemans");
			expect(
				await entries.first().getByRole("link", { name: order.number }).getAttribute("href"),
			).toBe(`/portal/orders/${order.number}`);
		});
		await expect.poll(() => dot(app.page).count()).toBe(0);
		expect(
			sentMail(users.riedel)
				.slice(before)
				.map((mail) => mail.subject),
		).toEqual([`An engineer is scheduled for ${order.number}`]);
	});

	test("the engineer's on my way shows as the engineer on the way, rung and mailed", async () => {
		const before = sentMail(users.riedel).length;
		await asOther(users.shltrEngineer, async (engineer) => {
			await engineer.goto(`${baseURL}/my/${order.number}`);
			await hydrated(engineer);
			await engineer.getByRole("button", { name: "On my way" }).click();
			await engineer.getByRole("button", { name: "On my way" }).waitFor({ state: "detached" });
		});
		expect(await value(`select status from "order" where id = ?`, [order.id])).toBe("on_the_way");
		await expect
			.poll(steps)
			.toEqual(["received:done", "scheduled:done", "on_the_way:current", "resolved:upcoming"]);
		expect(await app.page.locator("[data-client-status]").first().innerText()).toBe(
			"Engineer on the way",
		);
		await dot(app.page).waitFor();
		await readTray(app.page, async () => {
			const entry = app.page.locator("[data-notification][data-unread]");
			await expect.poll(() => entry.count()).toBe(1);
			expect(await entry.innerText()).toContain("Engineer on the way");
		});
		await expect
			.poll(() =>
				sentMail(users.riedel)
					.slice(before)
					.map((mail) => mail.subject),
			)
			.toEqual([`The engineer is on the way for ${order.number}`]);
	});

	test("another customer's contact hears nothing of it", async () => {
		await asOther(users.weggemans, async (page) => {
			await readTray(page, async () => {
				expect(await page.locator("[data-notification-tray]").innerText()).not.toContain(
					order.number,
				);
			});
		});
		expect(sentMail(users.weggemans).some((mail) => mail.subject.includes(order.number))).toBe(
			false,
		);
	});
});
