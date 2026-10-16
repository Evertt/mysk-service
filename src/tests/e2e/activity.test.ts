import { describe, expect, test } from "vite-plus/test";

import { formatNumber } from "#lib/i18n/format.ts";

import { baseURL, organizations, rows, useApp, userNames, users, value, quiet } from "./app.ts";

const { north, south } = organizations;
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

/** A day as a date input has it, `days` from today. */
const dayFromNow = (days: number) => {
	const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/** South's customer that is created and deleted, to read about in Dutch. */
const fleeting = { id: 0, code: "" };

/** What North changes here, to look for from South. */
const fromNorth = { customer: 0, order: 0, number: "", material: 0, labels: [] as string[] };

describe("in North", () => {
	test("editing a customer logs the changed field, and a refused or empty save nothing", async () => {
		const { page } = app;
		const [{ id, city }] = await rows<{ id: number; city: string }>(
			`select id, city from customer where code = 'CUST-0002' and organization_id = ?`,
			[north.id],
		);
		fromNorth.customer = id;
		const before = await entriesAbout("customer", id, north.id);

		await app.go("/customers/CUST-0002/edit");
		await page.getByLabel("City").fill("");
		await app.submit(page.getByRole("button", { name: "Save customer" }));
		expect(await app.issues()).toEqual([expect.stringMatching(/city/i)]);
		expect(await entriesAbout("customer", id, north.id)).toEqual(before);

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
		fromNorth.labels.push("Activityville");

		// Saved again as it is, nothing changes.
		await app.go("/customers/CUST-0002/edit");
		await page.getByRole("button", { name: "Save customer" }).click();
		await page.waitForURL((url) => url.pathname === "/customers/CUST-0002");
		await quiet(page);
		expect(await entriesAbout("customer", id, north.id)).toHaveLength(before.length + 1);
	});

	test("the customer's page shows it on its Activity card", async () => {
		await app.go("/customers/CUST-0002");
		expect((await logEntries())[0]).toMatch(
			new RegExp(`^${userNames.admin} updated customer CUST-0002 city: .+ → Activityville `),
		);
	});

	test("changing an order's status logs it, and its lines against it", async () => {
		const { page } = app;
		const [order] = await rows<{ id: number; number: string }>(
			`select id, number from "order" where organization_id = ? and status = 'quote'
			 and scheduled_for is null and exists (select 1 from order_line where order_id = "order".id)
			 order by priority = 'low' desc, id desc limit 1`,
			[north.id],
		);
		Object.assign(fromNorth, { order: order.id, number: order.number });
		fromNorth.labels.push(order.number);

		await app.go(`/orders/${order.number}/edit`);
		await page.getByLabel("Status").selectOption("scheduled");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${order.number}`);
		await quiet(page);
		// Its lines didn't change, so only the order did.
		expect(await entriesAbout("order", order.id, north.id)).toMatchObject([
			{
				action: "updated",
				subject_type: "order",
				subject_id: String(order.id),
				subject_label: order.number,
				changes: { status: ["quote", "scheduled"] },
			},
		]);
		expect((await logEntries())[0]).toMatch(
			new RegExp(`^${userNames.admin} updated order ${order.number} status: Quote → Scheduled `),
		);

		// A line's change is logged against the order, and shows on its card.
		const [line] = await rows<{ material_id: number; quantity: number; name: string }>(
			`select l.material_id, l.quantity, m.name from order_line l
			 join material m on m.id = l.material_id where l.order_id = ? order by l.id limit 1`,
			[order.id],
		);
		await app.go(`/orders/${order.number}/edit`);
		await page
			.locator("tbody tr")
			.first()
			.getByLabel("Quantity")
			.fill(String(line.quantity + 1));
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${order.number}`);
		await quiet(page);
		expect((await entriesAbout("order", order.id, north.id))[1]).toMatchObject({
			action: "updated",
			subject_type: "order_line",
			subject_id: String(line.material_id),
			subject_label: line.name,
			parent_type: "order",
			parent_id: String(order.id),
			changes: { quantity: [line.quantity, line.quantity + 1] },
		});
		expect((await logEntries())[0]).toContain(
			`updated order line ${line.name} on order ${order.number} quantity: ` +
				`${formatNumber(line.quantity)} → ${formatNumber(line.quantity + 1)}`,
		);
	});

	test("a change refused for want of stock logs nothing", async () => {
		const { page } = app;
		const before = await entriesAbout("order", fromNorth.order, north.id);
		await app.go(`/orders/${fromNorth.number}/edit`);
		await page.locator("tbody tr").first().getByLabel("Quantity").fill("100000");
		await app.submit(page.getByRole("button", { name: "Save order" }));
		expect(await app.issues()).toEqual([expect.stringMatching(/in stock$/)]);
		expect(await entriesAbout("order", fromNorth.order, north.id)).toEqual(before);
	});

	test("receiving stock logs the new stock and the note", async () => {
		const { page } = app;
		const [material] = await rows<{ id: number }>(
			`select id from material where organization_id = ? and sku = 'MAT-0001'`,
			[north.id],
		);
		fromNorth.material = material.id;
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
		fromNorth.labels.push("Activity delivery");
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

	test("the feed filters by record type, user and date", async () => {
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

		await page.getByLabel("User").selectOption(await adminId());
		await page.getByRole("button", { name: "Filter" }).click();
		await page.waitForURL((url) => url.searchParams.has("user"));
		await expect.poll(async () => (await logEntries()).join("\n")).toContain("→ Activityville");

		await app.go(`/activity?type=customer&from=${dayFromNow(0)}&to=${dayFromNow(0)}`);
		expect((await logEntries()).join("\n")).toContain("→ Activityville");
		// Nothing has happened tomorrow yet.
		await app.go(`/activity?from=${dayFromNow(1)}`);
		expect(await page.getByText("No activity").count()).toBe(1);
	});

	test("the feed of one record has it and its parts, newest first", async () => {
		const { page } = app;
		await app.go(`/activity?type=order&id=${fromNorth.order}`);
		const entries = await logEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0]).toContain("updated order line");
		expect(entries[1]).toContain("status: Quote → Scheduled");
		expect(await page.getByText("Only the order").count()).toBe(1);
	});

	test("the dashboard shows the organization's latest changes", async () => {
		await app.go("/");
		const entries = await entriesIn("Recent changes");
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.length).toBeLessThanOrEqual(8);
		const labels = await rows<{ subject_label: string }>(
			`select distinct subject_label from activity where organization_id = ?`,
			[north.id],
		);
		for (const entry of entries) {
			expect(
				labels.some((row) => entry.includes(row.subject_label)),
				entry,
			).toBe(true);
		}
	});
});

describe("in South", () => {
	test("switching organization shows none of North's activity", async () => {
		await app.switchOrganization(south.name);
		for (const path of ["/activity", "/"]) {
			await app.go(path);
			const text = await app.page.locator("main").innerText();
			for (const label of fromNorth.labels) expect(text, path).not.toContain(label);
		}
	});

	test("creating and deleting a customer logs both, and the deleted one no longer links", async () => {
		const { page } = app;
		await app.go("/customers/new");
		await page.getByLabel("Name").fill("Fleeting Activity BV");
		await page.getByLabel("Segment").selectOption("small_business");
		await page.getByLabel("Street address").fill("Kanaalstraat 9");
		await page.getByLabel("Postal code").fill("5611 CT");
		await page.getByLabel("City").fill("Eindhoven");
		await page.getByLabel("Country").selectOption("Netherlands");
		await page.getByLabel("Contact person").fill("Fleur Kort");
		await page.getByLabel("Email").fill("fleur@fleeting.example");
		await page.getByLabel("Phone").fill("+31 40 765 4321");
		await page.getByRole("button", { name: "Create customer" }).click();
		await page.waitForURL(/\/customers\/CUST-\d{4}$/);
		await quiet(page);
		const code = app.path().split("/").pop()!;
		const id = await value<number>(
			`select id from customer where code = ? and organization_id = ?`,
			[code, south.id],
		);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/customers");

		const entries = await entriesAbout("customer", id, south.id);
		expect(entries.map((e) => [e.action, e.subject_label, e.user_name])).toEqual([
			["created", code, userNames.admin],
			["deleted", code, userNames.admin],
		]);
		expect(await entriesAbout("customer", id, north.id)).toEqual([]);
		Object.assign(fleeting, { id, code });

		await app.go(`/activity?type=customer&id=${id}`);
		expect(await logEntries()).toEqual([
			expect.stringMatching(new RegExp(`^${userNames.admin} deleted customer ${code} `)),
			expect.stringMatching(new RegExp(`^${userNames.admin} created customer ${code} `)),
		]);
		const feed = page.getByRole("list", { name: "Activity log", exact: true });
		expect(await feed.getByRole("link", { name: code }).count()).toBe(0);
	});

	test("North's records' activity can't be loaded by their ids", async () => {
		for (const [type, id] of [
			["customer", fromNorth.customer],
			["order", fromNorth.order],
			["material", fromNorth.material],
		] as const) {
			const path = `/activity?type=${type}&id=${id}`;
			await app.go(path);
			expect(await app.page.getByText("No activity").count(), path).toBe(1);
		}
		// South's own customer with the same code doesn't show North's changes to theirs.
		await app.go("/customers/CUST-0002");
		const card = app.page.locator('[data-card="activity"]');
		// Once it has loaded.
		await card.getByText("No activity").or(card.getByRole("list")).first().waitFor();
		expect(await card.innerText()).not.toContain("Activityville");
	});
});

describe("in Dutch", () => {
	/** Switches the language as the language menus do: Paraglide's cookie, read on every request. */
	const useLanguage = (locale: string) =>
		app.page.context().addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL }]);

	test("the feed reads in Dutch, with the words where Dutch puts them", async () => {
		await useLanguage("nl");
		await app.go(`/activity?type=customer&id=${fleeting.id}`);
		expect(await entriesIn("Activiteitenlog")).toEqual([
			expect.stringMatching(
				new RegExp(`^${userNames.admin} heeft klant ${fleeting.code} verwijderd `),
			),
			expect.stringMatching(
				new RegExp(`^${userNames.admin} heeft klant ${fleeting.code} aangemaakt `),
			),
		]);
		expect(await app.page.getByText("Alleen klant", { exact: true }).count()).toBe(1);
	});

	test("switching back to English", async () => {
		await useLanguage("en");
		await app.go("/activity");
		expect((await entriesIn("Activity log")).length).toBeGreaterThan(0);
	});
});
