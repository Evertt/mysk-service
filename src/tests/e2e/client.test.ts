/**
 * The customer portal (`/portal`), as SHLTR's customer Riedel's facilities contact uses it on a
 * phone: their open orders and reports, an order's progress, their equipment and locations, and
 * reporting a breakdown, also from a unit's or location's QR code. Isolation is in
 * `client.tenancy.test.ts`, the office's side (inviting, accepting) in `client.access.test.ts` and
 * `client.acceptance.test.ts`.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	fitsWidth,
	hydrated,
	mobileViewport,
	organizations,
	rows,
	useApp,
	users,
} from "./app.ts";

const { shltr } = organizations;
const app = useApp({ user: users.riedel, viewport: mobileViewport });

/** A SHLTR customer's id by its name. */
const customerId = async (name: string) =>
	(
		await rows<{ id: number }>(`select id from customer where organization_id = ? and name = ?`, [
			shltr.id,
			name,
		])
	)[0].id;

/** Riedel's reports from the portal, as seeded: oldest first. */
const reports = () =>
	rows<{ id: number; number: string; status: string; rejection_reason: string | null }>(
		`select o.id, o.number, o.status, r.rejection_reason from "order" o
		 join order_request r on r.order_id = o.id
		 join customer c on c.id = o.customer_id
		 where c.name = 'Riedel B.V.' and o.organization_id = ? order by o.created_at`,
		[shltr.id],
	);

/** The order numbers on the cards in a section of the page. */
const cardsIn = (section: string) =>
	app.page
		.getByRole("region", { name: section, exact: true })
		.locator("[data-order]")
		.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-order")!));

/** Opens `/q/<token>` and waits for where it leads. */
async function scan(page: Page, token: string) {
	const response = await page.goto(`${baseURL}/q/${token}`);
	await hydrated(page);
	const url = new URL(page.url());
	return { status: response?.status(), path: url.pathname, search: url.search };
}

describe("the customer portal", () => {
	test("signing in lands on their open orders, also the reports not accepted yet", async () => {
		expect(app.path()).toBe("/portal");
		await expect.poll(() => app.page.locator("header").innerText()).toContain("Riedel B.V.");
		const open = await cardsIn("Open orders");
		// The seed has two not accepted yet, one accepted and one rejected lately; another file on
		// this worker may have accepted, rejected or reported some meanwhile (`client.acceptance`,
		// `notifications`), so the page is held to the reports as stored now.
		const reported = await reports();
		const rejected = reported.filter((report) => report.rejection_reason);
		const accepted = reported.filter((report) => report.status === "quote");
		const awaiting = reported.filter((report) => report.status === "awaiting_acceptance");
		expect(rejected.length).toBeGreaterThan(0);
		expect(awaiting.length + accepted.length).toBeGreaterThan(0);
		const pending = await rows<{ number: string }>(
			`select number from "order" where customer_id = ? and status in
			 ('awaiting_acceptance', 'quote', 'scheduled', 'in_progress')`,
			[await customerId("Riedel B.V.")],
		);
		expect(open.toSorted()).toEqual(
			[...pending, ...rejected].map((report) => report.number).toSorted(),
		);
		const status = (number: string) =>
			app.page.locator(`[data-order="${number}"] [data-client-status]`).innerText();
		for (const report of awaiting) expect(await status(report.number)).toBe("Not accepted yet");
		for (const report of accepted) expect(await status(report.number)).toBe("Accepted");
		for (const report of rejected) {
			expect(await status(report.number)).toBe("Rejected");
			expect(await app.page.locator(`[data-order="${report.number}"]`).innerText()).toContain(
				`Rejected: ${report.rejection_reason}`,
			);
		}
		expect(await fitsWidth(app.page)).toBe(true);
	});

	test("the home page has the units needing attention (SHLTR has the condition module)", async () => {
		await app.go("/portal");
		const units = app.page.locator("[data-client-attention] [data-unit]");
		await units.first().waitFor();
		const statuses = await units
			.locator("[data-status]")
			.evaluateAll((badges) => badges.map((badge) => badge.getAttribute("data-status")));
		expect(statuses.length).toBeGreaterThan(0);
		for (const status of statuses) expect(["critical", "attention"]).toContain(status);
	});

	test("a rejected report's page says why", async () => {
		const rejected = (await reports()).find((report) => report.rejection_reason)!;
		await app.go(`/portal/orders/${rejected.number}`);
		expect(await app.page.locator("[data-rejection]").innerText()).toContain(
			rejected.rejection_reason!,
		);
		expect(await app.page.getByText("Reported by").count()).toBe(1);
		expect(await app.page.locator("main").innerText()).toContain("Marieke Verhoeven");
	});

	test("the orders page shows the open, the done or all of their orders", async () => {
		await app.go("/portal/orders");
		// Of the latest 200 orders, newest first, as the page has them.
		const latest = await rows<{ status: string }>(
			`select status from "order" where customer_id = ? order by created_at desc, id desc limit 200`,
			[await customerId("Riedel B.V.")],
		);
		const count = (statuses: string[]) =>
			latest.filter((row) => statuses.includes(row.status)).length;
		const shown = () => app.page.locator("main [data-order]").count();
		await expect
			.poll(shown)
			.toBe(count(["awaiting_acceptance", "quote", "scheduled", "in_progress"]));
		await app.page.getByRole("button", { name: /^Completed/ }).click();
		await expect.poll(shown).toBe(count(["completed", "invoiced"]));
		await app.page.getByRole("button", { name: /^All/ }).click();
		await expect.poll(shown).toBe(latest.length);
	});

	test("their equipment: each site with its locations and units, and a unit's history", async () => {
		await app.go("/portal/equipment");
		const units = await rows<{ serial_number: string }>(
			`select serial_number from equipment where customer_id = ?`,
			[await customerId("Riedel B.V.")],
		);
		const shown = await app.page
			.locator("main [data-unit]")
			.evaluateAll((links) => links.map((link) => link.getAttribute("data-unit") ?? ""));
		expect(shown.toSorted()).toEqual(units.map((unit) => unit.serial_number).toSorted());

		// A unit with orders: its page has them, and its inspection status (checklists is on).
		const [unit] = await rows<{ serial_number: string; orders: number }>(
			`select e.serial_number, count(*) as orders from equipment e
			 join order_unit ou on ou.equipment_id = e.id
			 where e.customer_id = ? group by e.id order by orders desc limit 1`,
			[await customerId("Riedel B.V.")],
		);
		await app.page.locator(`[data-unit="${unit.serial_number}"]`).first().click();
		await app.page.waitForURL((url) => url.pathname === `/portal/equipment/${unit.serial_number}`);
		await app.page.locator("[data-client-inspection]").waitFor();
		await expect
			.poll(() =>
				app.page
					.getByRole("region", { name: "Orders on this unit" })
					.locator("[data-order]")
					.count(),
			)
			.toBe(Math.min(50, unit.orders));
	});

	test("a done order shows its sign-off, its checklists' results and the work order to print", async () => {
		const [done] = await rows<{ number: string; signer_name: string; engineer_name: string }>(
			`select o.number, s.signer_name, s.engineer_name from "order" o
			 join customer c on c.id = o.customer_id join order_signoff s on s.order_id = o.id
			 where c.name = 'Riedel B.V.' and o.status in ('completed', 'invoiced')
			 and exists (select 1 from checklist k where k.order_id = o.id and k.status = 'completed')
			 order by o.id limit 1`,
		);
		await app.go(`/portal/orders/${done.number}`);
		// Signed by the engineer and Riedel's contact, as the seed signs SHLTR's done work.
		const signoff = app.page.locator("[data-signoff]");
		await signoff.waitFor();
		expect(await signoff.locator("img").count()).toBe(2);
		const text = await signoff.innerText();
		expect(text).toContain(done.signer_name);
		expect(text).toContain(done.engineer_name);
		await app.page.locator("[data-client-checklists] [data-checklist]").first().waitFor();
		await app.page.getByRole("link", { name: "Work order" }).click();
		await app.page.waitForURL(
			(url) => url.pathname === `/checklists/portal/work-orders/${done.number}`,
		);
		await app.page.locator(`[data-work-order="${done.number}"]`).waitFor();
		expect(await app.page.locator("[data-work-order] [data-outcome]").count()).toBeGreaterThan(0);
	});
});

describe("reporting a breakdown", () => {
	/** Riedel's latest order, as stored. */
	const latest = async () =>
		(
			await rows<{
				id: number;
				number: string;
				type: string;
				status: string;
				priority: string;
				description: string;
				reporter_name: string;
				unit: number;
			}>(
				`select o.id, o.number, o.type, o.status, o.priority, o.description, r.reporter_name,
					(select equipment_id from order_unit where order_id = o.id) as unit
				 from "order" o left join order_request r on r.order_id = o.id
				 where o.customer_id = ? order by o.id desc limit 1`,
				[await customerId("Riedel B.V.")],
			)
		)[0];

	test("makes a breakdown order awaiting acceptance, and shows it reported", async () => {
		await app.go("/portal/report");
		const unit = app.page.getByLabel("Unit");
		const [choice] = await unit
			.locator("option:not([value=''])")
			.evaluateAll((options) =>
				options.slice(0, 1).map((option) => (option as HTMLOptionElement).value),
			);
		await unit.selectOption(choice);
		await app.page.getByLabel("What's wrong?").fill("Roldeur dock 4 sluit niet meer.");
		await app.page.getByText("It's at a standstill or unsafe.").click();
		await app.page.getByRole("button", { name: "Report breakdown" }).click();
		await app.page.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
		await app.page.locator("[data-reported]").waitFor();
		const created = await latest();
		expect(created).toMatchObject({
			type: "breakdown",
			status: "awaiting_acceptance",
			priority: "urgent",
			description: "Roldeur dock 4 sluit niet meer.",
			reporter_name: "Marieke Verhoeven",
			unit: Number(choice),
		});
		expect(app.path()).toBe(`/portal/orders/${created.number}`);
		expect(await app.page.locator("[data-client-status]").first().innerText()).toBe(
			"Not accepted yet",
		);
		// Logged as created by them.
		const [entry] = await rows<{ user_name: string; action: string }>(
			`select user_name, action from activity where subject_type = 'order' and subject_id = ?`,
			[String(created.id)],
		);
		expect(entry).toEqual({ user_name: "Marieke Verhoeven", action: "created" });
	});

	test("asks for the unit and what's wrong", async () => {
		await app.go("/portal/report");
		await app.page.getByRole("button", { name: "Report breakdown" }).click();
		await expect.poll(() => app.issues()).toContain("Choose the unit that broke down.");
		expect(await app.issues()).toContain("Describe what's wrong.");
	});

	test("a unit's QR code opens the report with the unit filled in", async () => {
		const [unit] = await rows<{ id: number; serial_number: string; qr_token: string }>(
			`select id, serial_number, qr_token from equipment where customer_id = ? order by id desc limit 1`,
			[await customerId("Riedel B.V.")],
		);
		expect(await scan(app.page, unit.qr_token)).toEqual({
			status: 200,
			path: "/portal/report",
			search: `?unit=${encodeURIComponent(unit.serial_number)}`,
		});
		await app.page.locator(`[data-scanned-unit="${unit.serial_number}"]`).waitFor();
		await app.page.getByLabel("What's wrong?").fill("Lamp brandt niet.");
		await app.page.getByRole("button", { name: "Report breakdown" }).click();
		await app.page.locator("[data-reported]").waitFor();
		expect(await latest()).toMatchObject({ unit: unit.id, priority: "normal" });
	});

	test("a location's QR code offers the units at the location", async () => {
		const [location] = await rows<{ id: number; qr_token: string }>(
			`select l.id, l.qr_token from equipment_location l
			 join customer_site s on s.id = l.site_id
			 where s.customer_id = ? and exists (select 1 from equipment e where e.location_id = l.id)
			 order by l.id limit 1`,
			[await customerId("Riedel B.V.")],
		);
		expect(await scan(app.page, location.qr_token)).toMatchObject({
			path: "/portal/report",
			search: `?location=${location.id}`,
		});
		const units = await rows<{ id: number }>(`select id from equipment where location_id = ?`, [
			location.id,
		]);
		const offered = await app.page
			.getByLabel("Unit")
			.locator("option:not([value=''])")
			.evaluateAll((options) =>
				options.map((option) => Number((option as HTMLOptionElement).value)),
			);
		const byId = (a: number, b: number) => a - b;
		expect(offered.toSorted(byId)).toEqual(units.map((unit) => unit.id).toSorted(byId));
	});
});
