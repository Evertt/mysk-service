/**
 * Accepting and rejecting the orders customers report in the customer portal, in SHLTR's office:
 * the badge on the sidebar's Orders and the dashboard's stat count them, the orders list filters
 * them, they're off the planning board, a planner accepts one (planning it at once) or rejects one
 * with a reason, and the customer sees the outcome in their portal.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, hydrated, organizations, rows, useApp, users } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

interface Report {
	id: number;
	number: string;
	customer: string;
	status: string;
}

/** SHLTR's orders reported in the portal, as stored now, oldest first. */
const reports = () =>
	rows<Report>(
		`select o.id, o.number, c.name as customer, o.status from "order" o
		 join order_request r on r.order_id = o.id join customer c on c.id = o.customer_id
		 where o.organization_id = ? order by o.created_at`,
		[shltr.id],
	);
const awaiting = async () =>
	(await reports()).filter((report) => report.status === "awaiting_acceptance");

/** An order and its request, as stored. */
const stored = async (id: number) =>
	(
		await rows<{
			status: string;
			engineer: string | null;
			decided_by: string | null;
			rejection_reason: string | null;
		}>(
			`select o.status, e.name as engineer, u.name as decided_by, r.rejection_reason
			 from "order" o join order_request r on r.order_id = o.id
			 left join engineer e on e.id = o.engineer_id left join user u on u.id = r.decided_by
			 where o.id = ?`,
			[id],
		)
	)[0];

const badge = () => app.page.locator("[data-awaiting-acceptance]");

describe("orders awaiting acceptance", () => {
	test("are counted on the sidebar's Orders and on the dashboard", async () => {
		const count = (await awaiting()).length;
		expect(count).toBe(3);
		await app.go("/");
		await expect.poll(() => badge().innerText()).toBe(String(count));
		const stat = app.page.locator("[data-awaiting-link]");
		expect(await stat.innerText()).toContain(String(count));
	});

	test("the dashboard's stat opens the orders list on them", async () => {
		await app.page.locator("[data-awaiting-link]").click();
		await app.page.waitForURL((url) => url.searchParams.get("status") === "awaiting_acceptance");
		await app.tableSettled();
		expect(await app.rowCount()).toBe((await awaiting()).length);
		expect(await app.filterPill("Status").innerText()).toContain("Awaiting acceptance");
	});

	test("are off the planning board's backlog", async () => {
		await app.go("/schedule");
		for (const report of await awaiting()) {
			expect(await app.page.locator(`[data-order="${report.number}"]`).count(), report.number).toBe(
				0,
			);
		}
	});
});

describe("accepting and rejecting", () => {
	test("accepting with an engineer and a day plans it at once", async () => {
		const report = (await awaiting()).find((each) => each.customer === "Weggemans Logistiek")!;
		await app.go(`/orders/${report.number}`);
		await app.page.getByRole("button", { name: "Accept" }).click();
		const dialog = app.page.getByRole("dialog");
		await dialog.getByLabel("Engineer").selectOption({ label: "Lev Hoekstra" });
		const tomorrow = Temporal.Now.plainDateISO().add({ days: 1 }).toString();
		await dialog.getByLabel("Day").fill(tomorrow);
		await dialog.getByLabel("Time").fill("09:30");
		await app.submit(dialog.getByRole("button", { name: "Accept" }));
		await app.page.locator('[data-decision="accepted"]').waitFor();
		expect(await stored(report.id)).toEqual({
			status: "scheduled",
			engineer: "Lev Hoekstra",
			decided_by: "Jan Weggemans",
			rejection_reason: null,
		});
		const logged = await rows<{ action: string; user_name: string }>(
			`select action, user_name from activity where subject_type = 'order' and subject_id = ?
			 order by id`,
			[String(report.id)],
		);
		expect(logged.slice(-2)).toEqual([
			{ action: "accepted", user_name: "Jan Weggemans" },
			{ action: "scheduled", user_name: "Jan Weggemans" },
		]);
		await expect.poll(() => badge().innerText()).toBe("2");
	});

	test("an awaiting order is accepted or rejected first, without Edit; accepting with an engineer but no day asks for the day", async () => {
		const [report] = await awaiting();
		await app.go(`/orders/${report.number}`);
		expect(await app.page.locator("[data-acceptance]").innerText()).toContain(
			"reported it in the customer portal",
		);
		expect(await app.page.getByRole("link", { name: "Edit" }).count()).toBe(0);
		await app.page.getByRole("button", { name: "Accept" }).click();
		const dialog = app.page.getByRole("dialog");
		await dialog.getByLabel("Engineer").selectOption({ label: "Lev Hoekstra" });
		await app.submit(dialog.getByRole("button", { name: "Accept" }));
		expect(await app.issues()).toContain("Choose a day to plan it for the engineer.");
		expect((await stored(report.id)).status).toBe("awaiting_acceptance");
	});

	// Accepting without a plan makes it a quote: `acceptance.spec.ts` ("makes it a quote").
	test("rejecting needs a reason, and cancels it with the reason", async () => {
		const [report] = await awaiting();
		await app.go(`/orders/${report.number}`);
		await app.page.getByRole("button", { name: "Reject" }).click();
		const dialog = app.page.getByRole("dialog");
		await app.submit(dialog.getByRole("button", { name: "Reject" }));
		expect(await app.issues()).toContain("Say why, for the customer.");
		await dialog.getByLabel("Reason").fill("Dubbele melding: zie de opdracht van gisteren.");
		await app.submit(dialog.getByRole("button", { name: "Reject" }));
		await app.page.locator('[data-decision="rejected"]').waitFor();
		expect(await stored(report.id)).toMatchObject({
			status: "cancelled",
			rejection_reason: "Dubbele melding: zie de opdracht van gisteren.",
		});
		expect(
			(
				await rows<{ action: string; note: string }>(
					`select action, note from activity where subject_type = 'order' and subject_id = ?
					 order by id desc limit 1`,
					[String(report.id)],
				)
			)[0],
		).toEqual({ action: "rejected", note: "Dubbele melding: zie de opdracht van gisteren." });
		// The one left awaits.
		await expect.poll(() => badge().innerText()).toBe("1");
		// Decided: no more accepting or rejecting.
		expect(await app.page.getByRole("button", { name: "Accept" }).count()).toBe(0);
	});

	test("the customer sees the outcome in their portal", async () => {
		const decided = (await reports()).slice(-5);
		const { page } = await signedInPage(app, users.riedel);
		try {
			for (const report of decided.filter((each) => each.customer === "Riedel B.V.")) {
				await page.goto(`${baseURL}/portal/orders/${report.number}`);
				await hydrated(page);
				const status = await page.locator("[data-client-status]").first().innerText();
				const expected = {
					quote: "Accepted",
					cancelled: "Rejected",
					scheduled: "Scheduled",
					awaiting_acceptance: "Not accepted yet",
				}[report.status];
				expect(status, report.number).toBe(expected);
			}
			const rejected = decided.find(
				(each) => each.customer === "Riedel B.V." && each.status === "cancelled",
			)!;
			await page.goto(`${baseURL}/portal/orders/${rejected.number}`);
			await hydrated(page);
			expect(await page.locator("[data-rejection]").innerText()).toContain(
				(await stored(rejected.id)).rejection_reason!,
			);
		} finally {
			await page.context().close();
		}
		const { page: weggemans } = await signedInPage(app, users.weggemans);
		try {
			const planned = decided.find((each) => each.customer === "Weggemans Logistiek")!;
			await weggemans.goto(`${baseURL}/portal/orders/${planned.number}`);
			await hydrated(weggemans);
			expect(await weggemans.locator("[data-client-status]").first().innerText()).toBe("Scheduled");
			expect(await weggemans.locator("main").innerText()).toContain("Lev");
			expect(await weggemans.locator("main").innerText()).not.toContain("Hoekstra");
		} finally {
			await weggemans.context().close();
		}
	});
});
