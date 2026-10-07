import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "../src/lib/server/db/demo.ts";
import {
	baseURL,
	hydrated,
	mobileViewport,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	users,
	value,
} from "./app.ts";

const { north, south } = organizations;
const app = useApp({ user: users.engineer, viewport: mobileViewport });

interface Order {
	id: number;
	number: string;
	status: string;
	labor_hours: number;
	completed_at: number | null;
}

/** The engineer record the field engineer's account is linked to. */
const me = async () =>
	(
		await rows<{ id: number; name: string; user_id: string }>(
			`select e.id, e.name, e.user_id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.engineer, north.id],
		)
	)[0];
const orderByNumber = async (number: string) =>
	(
		await rows<Order>(
			`select id, number, status, labor_hours, completed_at from "order"
			 where number = ? and organization_id = ?`,
			[number, north.id],
		)
	)[0];
/** An order as stored, with its lines, notes and sign-off, to check that nothing changed. */
const snapshot = (id: number) =>
	rows(
		`select o.*,
			(select group_concat(material_id || 'x' || quantity) from order_line where order_id = o.id) as lines,
			(select count(*) from order_note where order_id = o.id) as notes,
			(select count(*) from order_signoff where order_id = o.id) as signoffs
		 from "order" o where id = ?`,
		[id],
	);
const movements = (number: string) =>
	rows<{ material_id: number; quantity: number; kind: string }>(
		`select material_id, quantity, kind from stock_movement
		 where order_number = ? and organization_id = ? order by id`,
		[number, north.id],
	);
const stockOf = (materialId: number) =>
	value<number>(`select stock from material where id = ?`, [materialId]);

/** The order numbers on the cards in a section of the list. */
const cardsIn = (section: string) =>
	app.page
		.getByRole("region", { name: section, exact: true })
		.locator("[data-order]")
		.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-order")!));

describe("the engineer portal", () => {
	let job: Order;

	test("signing in lands on their own open work, by day, and what they completed", async () => {
		const { page } = app;
		expect(app.path()).toBe("/my");
		const engineer = await me();
		expect(await page.locator("header").innerText()).toContain(engineer.name);

		const open = await rows<{ number: string }>(
			`select number from "order" where engineer_id = ? and organization_id = ?
			 and status in ('scheduled', 'in_progress') order by scheduled_for`,
			[engineer.id, north.id],
		);
		const sections = await page
			.locator("section")
			.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")!));
		expect(sections[0]).toBe("Today");
		expect(sections).toContain("Tomorrow");
		const shown = [];
		for (const section of sections.filter((s) => s !== "Recently completed")) {
			shown.push(...(await cardsIn(section)));
		}
		expect(shown.toSorted()).toEqual(open.map((o) => o.number).toSorted());
		expect((await cardsIn("Today")).length).toBeGreaterThanOrEqual(2);

		const done = await rows<{ number: string }>(
			`select number from "order" where engineer_id = ? and organization_id = ?
			 and status in ('completed', 'invoiced') order by completed_at desc limit 10`,
			[engineer.id, north.id],
		);
		expect(await cardsIn("Recently completed")).toEqual(done.map((o) => o.number));

		// Fits a phone's screen.
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBe(true);
	});

	test("an order shows what's needed on site, with a tap-to-call link", async () => {
		const { page } = app;
		const [first] = await rows<Order>(
			`select id, number, status, labor_hours, completed_at from "order"
			 where engineer_id = ? and status = 'scheduled' order by scheduled_for limit 1`,
			[(await me()).id],
		);
		job = first;
		await page.locator(`a[data-order="${job.number}"]`).first().click();
		await page.waitForURL((url) => url.pathname === `/my/${job.number}`);
		await page.getByRole("button", { name: "Start job" }).waitFor();

		const [details] = await rows<Record<string, string>>(
			`select c.name, c.contact_name, c.phone, c.city, o.description, e.serial_number
			 from "order" o join customer c on c.id = o.customer_id
			 left join equipment e on e.id = o.equipment_id where o.id = ?`,
			[job.id],
		);
		const text = await page.locator("main").innerText();
		for (const field of ["name", "contact_name", "phone", "city", "description"]) {
			expect(text, field).toContain(details[field]);
		}
		if (details.serial_number) expect(text).toContain(details.serial_number);
		expect(await page.getByRole("link", { name: "Call" }).getAttribute("href")).toBe(
			`tel:${details.phone}`,
		);
		// Not started yet: no hours, materials or sign-off.
		expect(await page.getByRole("button", { name: "Complete job" }).count()).toBe(0);
	});

	test("starting the job puts it in progress, without moving stock", async () => {
		const { page } = app;
		const before = await movements(job.number);
		await page.getByRole("button", { name: "Start job" }).click();
		await app.toast("Job started");
		expect((await orderByNumber(job.number)).status).toBe("in_progress");
		expect(await movements(job.number)).toEqual(before);
		await page.getByRole("button", { name: "Complete job" }).waitFor();
	});

	test("logging hours saves them", async () => {
		const { page } = app;
		await page.getByLabel("Hours").fill("2.75");
		await page.getByRole("button", { name: "Save hours" }).click();
		await app.toast("Hours saved");
		expect((await orderByNumber(job.number)).labor_hours).toBe(2.75);
	});

	test("a material used comes out of stock, the same way as in the office", async () => {
		const { page } = app;
		const [part] = await rows<{ id: number; name: string; stock: number }>(
			`select id, name, stock from material where organization_id = ? and unit = 'pcs'
			 and stock >= 3 and id not in (select material_id from order_line where order_id = ?)
			 order by id limit 1`,
			[north.id, job.id],
		);
		const before = await movements(job.number);
		await page.getByRole("button", { name: "Add material" }).click();
		const line = page.locator("[data-line]").last();
		await line.getByLabel("Material", { exact: true }).selectOption(String(part.id));
		await line.getByLabel("Quantity").fill("2");
		await page.getByRole("button", { name: "Save materials" }).click();
		await app.toast("Materials saved");

		expect(
			await value(`select quantity from order_line where order_id = ? and material_id = ?`, [
				job.id,
				part.id,
			]),
		).toBe(2);
		expect((await movements(job.number)).slice(before.length)).toEqual([
			{ material_id: part.id, quantity: -2, kind: "consumption" },
		]);
		expect(await stockOf(part.id)).toBe(part.stock - 2);
		expect(await unbalancedStock(north.id)).toEqual([]);

		// More than there is is refused on the line, naming what's available, and changes nothing.
		const stored = await snapshot(job.id);
		await line.getByLabel("Quantity").fill(String(part.stock + 5));
		await app.submit(page.getByRole("button", { name: "Save materials" }));
		expect(await app.issues()).toEqual([`Only ${part.stock} pcs of ${part.name} in stock`]);
		expect(await snapshot(job.id)).toEqual(stored);
		expect(await stockOf(part.id)).toBe(part.stock - 2);
		await line.getByLabel("Quantity").fill("2");
	});

	test("a note is kept with the order", async () => {
		const { page } = app;
		await page.getByLabel("Add a note").fill("Replaced the gasket; check again in spring.");
		await page.getByRole("button", { name: "Add note" }).click();
		await app.toast("Note added");
		const [note] = await rows<{ text: string; user_id: string; organization_id: string }>(
			`select text, user_id, organization_id from order_note where order_id = ?`,
			[job.id],
		);
		expect(note).toEqual({
			text: "Replaced the gasket; check again in spring.",
			user_id: (await me()).user_id,
			organization_id: north.id,
		});
		await page.getByText("Replaced the gasket").waitFor();
	});

	test("completing needs the customer's signature", async () => {
		const { page } = app;
		await page.getByLabel("Signed by").fill("Robin Customer");
		await app.submit(page.getByRole("button", { name: "Complete job" }));
		expect(await app.issues()).toContain("Ask the customer to sign");
		expect((await orderByNumber(job.number)).status).toBe("in_progress");
	});

	test("completing with a drawn signature stores the sign-off", async () => {
		const { page } = app;
		const box = (await page.locator("canvas").boundingBox())!;
		await page.mouse.move(box.x + 20, box.y + box.height / 2);
		await page.mouse.down();
		for (let i = 1; i <= 10; i++) {
			await page.mouse.move(box.x + 20 + i * 20, box.y + box.height / 2 + (i % 2 ? -25 : 25));
		}
		await page.mouse.up();
		await page.getByRole("button", { name: "Complete job" }).click();
		await app.toast("Job completed");

		const order = await orderByNumber(job.number);
		expect(order.status).toBe("completed");
		expect(order.completed_at).not.toBeNull();
		const [signoff] = await rows<{ signer_name: string; signature: string; user_id: string }>(
			`select signer_name, signature, user_id from order_signoff where order_id = ?`,
			[job.id],
		);
		expect(signoff.signer_name).toBe("Robin Customer");
		expect(signoff.signature).toMatch(/^data:image\/png;base64,/);
		expect(signoff.user_id).toBe((await me()).user_id);
		await page.getByText("Signed off").waitFor();
		expect(await page.getByRole("button", { name: "Save hours" }).count()).toBe(0);

		// It's now among the recently completed.
		await app.go("/my");
		expect((await cardsIn("Recently completed"))[0]).toBe(job.number);
	});

	test("the office sees the sign-off on the order", async () => {
		const { page: office } = await signedInPage(users.admin);
		try {
			await office.goto(`${baseURL}/orders/${job.number}`);
			await hydrated(office);
			const report = office.locator('[data-slot="work-report"]');
			const text = await report.innerText();
			expect(text).toContain("Robin Customer");
			expect(text).toContain("Replaced the gasket");
			expect(
				await report.getByRole("img", { name: "Signature of Robin Customer" }).getAttribute("src"),
			).toMatch(/^data:image\/png;base64,/);
		} finally {
			await office.context().close();
		}
	});
});

describe("what a field engineer can't do", () => {
	test("office pages send them to the portal", async () => {
		for (const path of ["/", "/orders", "/schedule", "/settings", "/engineers/1/edit"]) {
			await app.go(path);
			expect(app.path(), path).toBe("/my");
		}
	});

	test("office remote functions refuse them with a 403", async () => {
		// The dashboard's query (which signing in calls) and the delete-order form, as the office
		// calls them.
		const office = await signedInPage(users.admin);
		let form: Awaited<ReturnType<typeof captureDelete>>;
		try {
			form = await captureDelete(office.page);
		} finally {
			await office.page.context().close();
		}
		const query = office.requests.find((url) => url.includes("/getDashboard"))!;
		expect(query).toBeDefined();

		// Sent from the engineer's page, so with their session.
		const answers = await app.expectingErrors(() =>
			app.page.evaluate(
				async ({ query, form }) => {
					const answer = async (response: Response) =>
						`${response.status} ${await response.text()}`;
					return [
						await answer(await fetch(query)),
						await answer(
							await fetch(form.url, {
								method: "POST",
								headers: form.headers,
								body: new Uint8Array(form.body),
							}),
						),
					];
				},
				{ query, form },
			),
		);
		for (const answer of answers) expect(answer).toMatch(/^403|"status":403/);
	});

	test("another engineer's order is a 404, also by a tampered id", async () => {
		const { page } = app;
		const mine = await me();
		const [others] = await rows<Order>(
			`select id, number, status from "order" where organization_id = ? and engineer_id <> ?
			 and status = 'in_progress' order by id limit 1`,
			[north.id, mine.id],
		);
		expect((await app.go(`/my/${others.number}`))?.status()).toBe(404);

		const [own] = await rows<Order>(
			`select id, number from "order" where engineer_id = ? and status = 'in_progress' limit 1`,
			[mine.id],
		);
		const [southern] = await rows<Order>(
			`select id, number from "order" where organization_id = ? and status = 'in_progress' limit 1`,
			[south.id],
		);
		const before = [await snapshot(others.id), await snapshot(southern.id), await snapshot(own.id)];
		await app.go(`/my/${own.number}`);
		for (const victim of [others.id, southern.id]) {
			for (const [form, button] of [
				["Add a note", "Add note"],
				["Hours", "Save hours"],
			]) {
				await page.getByLabel(form).fill("1");
				const result = await app.expectingErrors(async () => {
					await page.getByRole("button", { name: button }).evaluate((element, id) => {
						element
							.closest("form")!
							.querySelector<HTMLInputElement>('input[type="hidden"][name^="id"]')!.value =
							String(id);
					}, victim);
					return app.submit(page.getByRole("button", { name: button }));
				});
				expect(result, `${button} on ${victim}`).toMatch(/"status":404/);
				await app.go(`/my/${own.number}`);
			}
		}
		expect([
			await snapshot(others.id),
			await snapshot(southern.id),
			await snapshot(own.id),
		]).toEqual(before);
	});
});

/**
 * A page in a browser context of its own, signed in as `email`, with the URLs of the remote
 * functions it called on the way. Close its context when done.
 */
async function signedInPage(email: string) {
	const browser = app.page.context().browser()!;
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const page = await context.newPage();
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_app/remote")) requests.push(request.url());
	});
	await page.goto(`${baseURL}/login`);
	await hydrated(page);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(DEMO_PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL((url) => url.pathname !== "/login");
	await page.waitForLoadState("networkidle");
	return { page, requests };
}

/**
 * The request the office's delete-order form sends (its URL, headers and binary body), for an
 * order that doesn't exist, so the office gets a 404 and nothing is deleted.
 */
async function captureDelete(office: Page) {
	const number = await value<string>(
		// One that isn't invoiced, which can't be deleted.
		`select number from "order" where organization_id = ? and status <> 'invoiced'
		 order by id limit 1`,
		[north.id],
	);
	await office.goto(`${baseURL}/orders/${number}`);
	await hydrated(office);
	await office.getByRole("button", { name: "Delete" }).click();
	const dialog = office.getByRole("alertdialog");
	await dialog.waitFor();
	const captured = office.evaluate(() => {
		document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
			"999999999";
		// The form's body is a blob, which the browser's request log doesn't keep.
		return new Promise<{ url: string; headers: Record<string, string>; body: number[] }>(
			(resolve) => {
				const original = window.fetch;
				window.fetch = async (input, init) => {
					const url = input instanceof Request ? input.url : input.toString();
					if (url.includes("/_app/remote") && init?.body instanceof Blob) {
						resolve({
							url,
							headers: Object.fromEntries(new Headers(init.headers)),
							body: [...new Uint8Array(await init.body.arrayBuffer())],
						});
					}
					return original(input, init);
				};
			},
		);
	});
	await dialog.getByRole("button", { name: "Delete" }).click();
	const form = await captured;
	await office.waitForLoadState("networkidle");
	return form;
}
