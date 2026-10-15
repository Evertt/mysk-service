/**
 * "Changed by someone else": an order's (and a customer's) pages say so when another user changes
 * the record while it's open (`<ChangedElsewhere>`, `watchRecordChanges`), and not for the user's
 * own changes.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { isRemote, organizations, quiet, rows, userNames, users, useApp, value } from "./app.ts";

const { north, south } = organizations;
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

test("a customer's edit form says when someone else changed it", async () => {
	const [{ code }] = await rows<{ code: string }>(
		`select code from customer where organization_id = ? order by id limit 1`,
		[north.id],
	);
	await anouk.go(`/customers/${code}/edit`);
	await pieter.go(`/customers/${code}/edit`);
	await pieter.page.getByLabel("Contact person").fill("Femke Jansen");
	await pieter.page.getByRole("button", { name: "Save customer" }).click();
	await pieter.page.waitForURL((url) => url.pathname === `/customers/${code}`);

	await notice(anouk.page).waitFor();
	expect(await notice(anouk.page).innerText()).toContain(`Changed by ${userNames.planner}`);
});

test("watching another tenant's record is refused", async () => {
	const { page } = anouk;
	const [{ number }] = await rows<{ number: string }>(
		`select number from "order" where organization_id = ? order by id limit 1`,
		[north.id],
	);
	const theirs = await value<number>(
		`select id from "order" where organization_id = ? order by id limit 1`,
		[south.id],
	);
	// The stream asks for South's order instead; its answer is read on its way back (the browser's
	// copy of a stream isn't kept for Playwright to read).
	const answer = new Promise<string>((resolve, reject) => {
		void page.route(
			(url) => isRemote(url.href, "watchRecordChanges"),
			async (route) => {
				try {
					const url = new URL(route.request().url());
					// devalue's flat JSON of `{ type, id }`, e.g. `[["__skrao",1],{"id":2,"type":3},1,"order"]`:
					// the object's fields are the indexes of their values.
					const flat = JSON.parse(
						Buffer.from(url.searchParams.get("payload")!, "base64url").toString(),
					) as unknown[];
					const arg = flat.find(
						(entry): entry is { id: number } =>
							!!entry && typeof entry === "object" && "id" in entry,
					)!;
					flat[arg.id] = theirs;
					url.searchParams.set("payload", Buffer.from(JSON.stringify(flat)).toString("base64url"));
					const response = await route.fetch({ url: url.href });
					resolve(await response.text());
					await route.fulfill({ response });
				} catch (error) {
					reject(error as Error);
				}
			},
			{ times: 1 },
		);
	});
	const body = await anouk.expectingErrors(async () => {
		await anouk.go(`/orders/${number}/edit`);
		return answer;
	});
	expect(body).toMatch(/"type":"error"/);
	expect(body).toMatch(/"status":404/);
	expect(await notice(page).count()).toBe(0);
});
