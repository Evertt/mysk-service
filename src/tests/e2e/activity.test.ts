/**
 * The activity log on the pages: a customer's change and a stock delivery on their records'
 * cards, the feed newest first with links, and its filter. What the log records of each change
 * (and of a refused or empty one), the feed's filters, one record's feed and South's view are
 * `components/activity/server/activity.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, userNames, users, value, quiet } from "./app.ts";

const { north } = organizations;
const app = useApp();

interface Entry {
	id: number;
	user_id: string | null;
	user_name: string;
	action: string;
	subject_type: string;
	subject_id: string;
	subject_label: string;
	parent_type: string | null;
	parent_id: string | null;
	changes: Record<string, [unknown, unknown]> | null;
	note: string | null;
}

/**
 * The log entries about a record (as subject or parent) in an organization, oldest first. Other
 * test files may change other records at the same time, so the checks look at their own records.
 */
async function entriesAbout(type: string, id: number | string, organizationId: string) {
	const found = await rows<Entry & { changes: string | null }>(
		`select id, user_id, user_name, action, subject_type, subject_id, subject_label, parent_type,
		 parent_id, changes, note from activity where organization_id = ?
		 and ((subject_type = ? and subject_id = ?) or (parent_type = ? and parent_id = ?)) order by id`,
		[organizationId, type, String(id), type, String(id)],
	);
	return found.map((row) => ({ ...row, changes: row.changes && JSON.parse(row.changes) }));
}

const adminId = () => value<string>(`select id from user where email = ?`, [users.admin]);

/** The entries of a list on the page (once it has loaded), as text. */
async function entriesIn(list: string) {
	const found = app.page.getByRole("list", { name: list, exact: true });
	await found.waitFor();
	const texts = await found.locator(":scope > li").allInnerTexts();
	return texts.map((text) => text.replace(/\s+/g, " "));
}

/** The entries on a record's "Activity" card, or in the feed. */
const logEntries = () => entriesIn("Activity log");

describe("in North", () => {
	test("editing a customer logs the changed field, on the customer's Activity card", async () => {
		const { page } = app;
		const [{ id, city }] = await rows<{ id: number; city: string }>(
			`select id, city from customer where code = 'CUST-0002' and organization_id = ?`,
			[north.id],
		);
		const before = await entriesAbout("customer", id, north.id);

		await app.go("/customers/CUST-0002/edit");
		await page.getByLabel("City").fill("Activityville");
		await page.getByRole("button", { name: "Save customer" }).click();
		await page.waitForURL((url) => url.pathname === "/customers/CUST-0002");
		await quiet(page);
		expect((await entriesAbout("customer", id, north.id)).slice(before.length)).toEqual([
			{
				id: expect.any(Number),
				user_id: await adminId(),
				user_name: userNames.admin,
				action: "updated",
				subject_type: "customer",
				subject_id: String(id),
				subject_label: "CUST-0002",
				parent_type: null,
				parent_id: null,
				changes: { city: [city, "Activityville"] },
				note: null,
			},
		]);

		// The customer's page it's back on shows it on its Activity card.
		await expect
			.poll(async () => (await logEntries())[0])
			.toMatch(
				new RegExp(`^${userNames.admin} updated customer CUST-0002 city: .+ → Activityville `),
			);
	});

	test("receiving stock logs the new stock and the note", async () => {
		const { page } = app;
		const [material] = await rows<{ id: number }>(
			`select id from material where organization_id = ? and sku = 'MAT-0001'`,
			[north.id],
		);
		const before = await entriesAbout("material", material.id, north.id);
		await app.go("/materials/MAT-0001");
		await page.getByRole("button", { name: "Receive stock" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel(/^Quantity/).fill("5");
		await dialog.getByLabel("Note").fill("Activity delivery");
		await app.submit(dialog.getByRole("button", { name: "Receive" }));
		await app.toast("Stock received");
		const [received] = (await entriesAbout("material", material.id, north.id)).slice(before.length);
		expect(received).toMatchObject({
			action: "stock_received",
			subject_label: "MAT-0001",
			note: "Activity delivery",
		});
		const [was, is] = received.changes!.stock as [number, number];
		expect(is - was).toBeCloseTo(5, 2);
		// The card is brought up to date along with the stock.
		await expect
			.poll(async () => (await logEntries())[0])
			.toMatch(
				new RegExp(
					`^${userNames.admin} received stock of material MAT-0001 stock: .+ → .+ Activity delivery `,
				),
			);
	});

	test("the feed shows the changes newest first, with links to their records", async () => {
		const { page } = app;
		await app.go("/activity");
		const entries = await logEntries();
		const stock = entries.findIndex((e) => e.includes("received stock of material MAT-0001"));
		const city = entries.findIndex((e) => e.includes("→ Activityville"));
		expect(stock).toBeGreaterThanOrEqual(0);
		expect(city).toBeGreaterThan(stock);
		const feed = page.getByRole("list", { name: "Activity log", exact: true });
		expect(await feed.getByRole("link", { name: "MAT-0001" }).first().getAttribute("href")).toBe(
			"/materials/MAT-0001",
		);
		expect(await feed.getByRole("link", { name: "CUST-0002" }).first().getAttribute("href")).toBe(
			"/customers/CUST-0002",
		);
	});

	test("the feed filters by record type", async () => {
		const { page } = app;
		await page.getByLabel("Record type").selectOption("customer");
		await page.getByRole("button", { name: "Filter" }).click();
		await page.waitForURL((url) => url.searchParams.get("type") === "customer");
		// Only customers, once the filtered feed has loaded.
		await expect
			.poll(async () => {
				const entries = await logEntries();
				return entries.length > 0 && entries.filter((e) => !/ customer CUST-/.test(e));
			})
			.toEqual([]);
		expect((await logEntries()).join("\n")).toContain("→ Activityville");
	});

	// The dashboard's recent changes are dashboard.live's.
});
