/**
 * A unit's timeline ("Wat gebeurt er met deze deur?") in the three shells, on SHLTR's Sectionaaldeur
 * D-07 at Riedel, which the seed gives the client's slide's day: in the office on its page, in the
 * engineer portal, and in the customer portal on a phone, with today's figures above it; and a
 * fault reported through the QR code shows on the office's page without a reload. What each entry
 * says, and to whom, is `equipment/server/timeline.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	fitsWidth,
	hydrated,
	mobileViewport,
	organizations,
	useApp,
	users,
	value,
} from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

/** Where the screenshots go, when asked for (`TIMELINE_SHOTS`). */
const shots = process.env.TIMELINE_SHOTS;

const serial = () =>
	value<string>(`select serial_number from equipment where organization_id = ? and name = ?`, [
		shltr.id,
		"Sectionaaldeur laaddok 07",
	]);

/** The timeline's entries' text, on `page`. */
const entries = (page: typeof app.page) =>
	page
		.locator("[data-unit-timeline] [data-timeline-entry]")
		.evaluateAll((items) => items.map((item) => item.textContent?.replace(/\s+/g, " ") ?? ""));

describe("a unit's timeline", () => {
	test("tells the office the slide's day on the unit's page, with today's figures", async () => {
		await app.go(`/equipment/${await serial()}`);
		const timeline = app.page.locator("[data-unit-timeline]");
		await timeline.locator("[data-timeline-entry]").first().waitFor();
		const text = (await entries(app.page)).join("\n");
		expect(text).toContain("Fault reported via the QR code");
		expect(text).toContain("Order created, engineer scheduled");
		expect(text).toContain("Order completed, with 2 photos");
		expect(text).toContain("14 min open — energy loss measured");
		const completed = timeline.locator('[data-timeline-entry="order.completed"]').first();
		expect(await completed.locator("[data-photo-thumbs] img").count()).toBe(2);
		const figures = timeline.locator("[data-timeline-figures]");
		expect(await figures.innerText()).toContain("Opened today");
		expect(await figures.innerText()).toContain("Energy lost today");
		// Day headings: the story's day is today or yesterday (above it, the warranty's end to come).
		const headings = await timeline.locator("[data-timeline-day] h3").allInnerTexts();
		expect(headings.some((heading) => /^(today|yesterday)$/i.test(heading))).toBe(true);
		if (shots) await timeline.screenshot({ path: `${shots}/office.png` });
	});

	test("in the engineer portal, on the unit's page", async () => {
		const { page } = await signedInPage(app, users.shltrEngineer);
		try {
			await page.setViewportSize(mobileViewport);
			await page.goto(`${baseURL}/my/equipment/${await serial()}`);
			await hydrated(page);
			const timeline = page.locator("[data-unit-timeline]");
			await timeline.locator("[data-timeline-entry]").first().waitFor();
			// The unit's installation at least; the story's order isn't theirs.
			expect((await entries(page)).join("\n")).toContain("Installed");
			expect(await fitsWidth(page)).toBe(true);
			if (shots) await page.screenshot({ path: `${shots}/engineer.png`, fullPage: true });
		} finally {
			await page.context().close();
		}
	});

	test("in the customer portal on a phone, under the unit's button and links", async () => {
		const { page } = await signedInPage(app, users.riedel);
		try {
			await page.setViewportSize(mobileViewport);
			await page.goto(`${baseURL}/portal/equipment/${await serial()}`);
			await hydrated(page);
			const timeline = page.getByRole("region", { name: "What's happening" });
			await timeline.locator("[data-timeline-entry]").first().waitFor();
			const text = (await entries(page)).join("\n");
			expect(text).toContain("Fault reported via the QR code");
			expect(text).toContain("Order completed, with 2 photos");
			expect(text).toContain("14 min open — energy loss measured");
			// Not the office's alerts, nor a defect's photo.
			expect(await timeline.locator('[data-timeline-entry="energy.alert"]').count()).toBe(0);
			expect(await timeline.locator('img[src^="/condition/photos/"]').count()).toBe(0);
			expect(await timeline.locator("[data-timeline-figures]").innerText()).toContain(
				"Opened today",
			);
			expect(await fitsWidth(page)).toBe(true);
			if (shots) await page.screenshot({ path: `${shots}/customer.png`, fullPage: true });
		} finally {
			await page.context().close();
		}
	});

	test("shows a fault reported through the QR code at once on the office's page", async () => {
		const unit = await serial();
		await app.go(`/equipment/${unit}`);
		await app.page.locator("[data-unit-timeline] [data-timeline-entry]").first().waitFor();

		const { page } = await signedInPage(app, users.riedel);
		try {
			await page.setViewportSize(mobileViewport);
			await page.goto(`${baseURL}/portal/report?unit=${encodeURIComponent(unit)}&via=qr`);
			await hydrated(page);
			await page.getByLabel("Description").fill("Deur slaat hard dicht bij dock 07.");
			await page.getByRole("button", { name: "Send report" }).click();
			await page.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
		} finally {
			await page.context().close();
		}

		const reported = app.page
			.locator('[data-unit-timeline] [data-timeline-entry="order.reported"]')
			.filter({ hasText: "Deur slaat hard dicht bij dock 07." });
		await reported.waitFor();
		expect(await reported.innerText()).toContain("Fault reported via the QR code");
	});
});
