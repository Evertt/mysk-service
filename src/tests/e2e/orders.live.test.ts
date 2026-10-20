/**
 * "Changed by someone else": an order's pages say so when another user changes it while it's
 * open (`<ChangedElsewhere>`, through the tab's feed of changes, `watchTenantChanges`), and not for
 * the user's own changes; and that feed is the one stream the tab needs, however many records it
 * goes through. That a
 * customer's save is announced to its pages, and that another tenant's record can't be watched,
 * is `components/activity/server/activity.spec.ts`'s.
 */
import type { Page, Request } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, quiet, rows, userNames, users, useApp, value } from "./app.ts";

const { north } = organizations;
/** Anouk, the admin, has the order open; Pieter, a planner, changes it. */
const anouk = useApp();
const pieter = useApp({ user: users.planner });

/** The notice, once it shows. */
const notice = (page: Page) => page.locator("[data-changed-elsewhere]");

/** Marks the page, to tell that it wasn't reloaded (the mark would be gone). */
const mark = (page: Page) => page.evaluate(() => Object.assign(window, { liveMarker: true }));
const marked = (page: Page) => page.evaluate(() => "liveMarker" in window);

/** Saves an order's edit form with another description, from `page`, and waits for its page. */
async function saveDescription(page: Page, number: string, description: string) {
	await page.getByLabel("Description").fill(description);
	await page.getByRole("button", { name: "Save order" }).click();
	await page.waitForURL((url) => url.pathname === `/orders/${number}`);
	await quiet(page);
}

describe("an order", () => {
	let number: string;

	test("its edit form says when someone else changed it, without reloading", async () => {
		// A quote, which no other test needs, and not the newest order: deleting that would free its
		// number for the next one.
		[{ number }] = await rows<{ number: string }>(
			`select number from "order" where organization_id = ? and status = 'quote'
			 order by id desc limit 1 offset 1`,
			[north.id],
		);
		await anouk.go(`/orders/${number}/edit`);
		await mark(anouk.page);
		expect(await notice(anouk.page).count()).toBe(0);

		await pieter.go(`/orders/${number}/edit`);
		await saveDescription(pieter.page, number, "Changed while Anouk had it open");

		await notice(anouk.page).waitFor();
		expect(await notice(anouk.page).innerText()).toContain(`Changed by ${userNames.planner}`);
		expect(await marked(anouk.page)).toBe(true);
	});

	test("reloading shows the latest version, and the notice goes", async () => {
		const { page } = anouk;
		await page.getByLabel("Description").fill("Typed over");
		await notice(page).getByRole("button", { name: "Reload" }).click();
		await notice(page).waitFor({ state: "detached" });
		await expect
			.poll(() => page.getByLabel("Description").inputValue())
			.toBe("Changed while Anouk had it open");
		expect(await marked(page)).toBe(true);
	});

	test("the user's own changes, on another page, say nothing", async () => {
		const { page } = anouk;
		const other = await anouk.anotherTab();
		try {
			await other.goto(new URL(`/orders/${number}/edit`, page.url()).href);
			await quiet(other);
			await saveDescription(other, number, "Anouk's own change");
		} finally {
			await other.context().close();
		}
		expect(
			await value(`select description from "order" where number = ? and organization_id = ?`, [
				number,
				north.id,
			]),
		).toBe("Anouk's own change");

		// Someone else's change after it does show, so the page was still listening.
		await pieter.go(`/orders/${number}/edit`);
		await saveDescription(pieter.page, number, "Pieter's second change");
		await notice(page).waitFor();
		expect(await notice(page).innerText()).toContain(`Changed by ${userNames.planner}`);
	});

	test("its own page says so too, and when it's deleted", async () => {
		await anouk.go(`/orders/${number}`);
		expect(await notice(anouk.page).count()).toBe(0);

		await pieter.go(`/orders/${number}`);
		await pieter.page.getByRole("button", { name: "Delete" }).click();
		await pieter.page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await pieter.page.waitForURL((url) => url.pathname === "/orders");
		await quiet(pieter.page);

		await notice(anouk.page).waitFor();
		expect(await notice(anouk.page).innerText()).toContain(`Deleted by ${userNames.planner}`);
		expect(await notice(anouk.page).getByRole("button", { name: "Reload" }).count()).toBe(0);
	});
});

describe("going from record to record", () => {
	/** Follows a link to `path` (without a new document), as one on the page would. */
	async function follow(page: Page, path: string) {
		await page.evaluate((href) => {
			const link = Object.assign(document.createElement("a"), { href });
			document.body.append(link);
			link.click();
			link.remove();
		}, path);
		await page.waitForURL((url) => url.pathname === path);
		await quiet(page);
	}

	test("opens no live query's stream after the shell's, so none pile up", async () => {
		const { page } = anouk;
		const walk = await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from "order" o
			 join order_unit u on u.order_id = o.id join equipment e on e.id = u.equipment_id
			 where o.organization_id = ? group by o.id order by o.id limit 4`,
			[north.id],
		);
		expect(walk).toHaveLength(4);
		/** The live queries' streams the tab asked for, by remote function. */
		const streams: string[] = [];
		const asked = (request: Request) => {
			if (request.headers().accept?.includes("text/event-stream")) {
				streams.push(new URL(request.url()).pathname.split("/").at(-1)!);
			}
		};
		page.on("request", asked);
		try {
			await anouk.go(`/orders/${walk[0].number}`);
			expect(streams.sort()).toEqual(["watchShell", "watchTenantChanges"]);
			streams.length = 0;
			// (Not to the page it's on: a link to it refreshes everything, the shell's streams too.)
			for (const [i, { number, serial }] of walk.entries()) {
				if (i) await follow(page, `/orders/${number}`);
				await follow(page, `/equipment/${serial}`);
			}
			await follow(page, `/orders/${walk[0].number}`);
			await follow(page, `/equipment/${walk[0].serial}`);
			expect(streams).toEqual([]);
		} finally {
			page.off("request", asked);
		}

		// It still hears of the record it shows.
		await pieter.go(`/equipment/${walk[0].serial}/edit`);
		await quiet(pieter.page);
		await pieter.page.getByLabel("Model").fill("Changed while Anouk had it open");
		await pieter.page.getByRole("button", { name: "Save equipment" }).click();
		await pieter.page.waitForURL((url) => url.pathname === `/equipment/${walk[0].serial}`);
		await notice(page).waitFor();
		expect(await notice(page).innerText()).toContain(`Changed by ${userNames.planner}`);
	});
});
