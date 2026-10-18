import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, useApp, value } from "#e2e/app.ts";
import { advanceDueDate, SOON_DAYS } from "#modules/maintenance/model.ts";

import {
	activeDueBefore,
	dayKey,
	daysFromToday,
	lastActivityId,
	type Plan,
	pageLocators,
	planActivity,
	planById,
	plansOf,
	today,
	unitWithoutPlan,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, dialog, planMenu } = pageLocators(app);

/** The unit this file gives a plan, and the plan. */
let unit: { id: number; serial_number: string; customer_id: number };
let plan: Plan;

describe("a unit's maintenance plans, in North", () => {
	test("a plan is added on the unit's page, and logged against the unit", async () => {
		const { page } = app;
		unit = await unitWithoutPlan(north.id);
		const since = await lastActivityId();
		await app.go(`/equipment/${unit.serial_number}`);
		await card().getByText("No maintenance plans").waitFor();
		await card().getByRole("button", { name: "Add plan" }).click();
		const form = dialog();
		await form.getByLabel("Description").fill("Quarterly filter check");
		await form.getByLabel("Order type").selectOption("inspection");
		await form.getByLabel("Interval in months").fill("3");
		// Long overdue, so it heads the due list.
		const due = daysFromToday(-400);
		await form.getByLabel("Next due on").fill(dayKey(due));
		await app.submit(form.getByRole("button", { name: "Save plan" }));
		await app.toast("Plan saved");
		await card().getByText("Quarterly filter check").waitFor();
		expect(await card().locator("[data-overdue]").count()).toBe(1);

		[plan] = await plansOf(unit.id);
		expect(plan).toMatchObject({
			organization_id: north.id,
			order_type: "inspection",
			description: "Quarterly filter check",
			interval_months: 3,
			next_due_on: dayKey(due),
			anchor_day: due.day,
			paused: 0,
			last_order_id: null,
		});
		expect(await planActivity(plan.id, since)).toEqual([
			{
				action: "created",
				subject_label: `${unit.serial_number} · Quarterly filter check`,
				parent_type: "equipment",
				changes: null,
			},
		]);
		// On the unit's activity card too.
		await app.go(`/equipment/${unit.serial_number}`);
		await page
			.getByText(/created maintenance plan/)
			.first()
			.waitFor();
	});

	test("it's edited, paused and resumed, each logged", async () => {
		const since = await lastActivityId();
		await planMenu("Quarterly filter check");
		await app.page.getByRole("menuitem", { name: "Edit" }).click();
		await dialog().getByLabel("Description").fill("Quarterly filter change");
		await app.submit(dialog().getByRole("button", { name: "Save plan" }));
		await card().getByText("Quarterly filter change").waitFor();

		await planMenu("Quarterly filter change");
		await app.page.getByRole("menuitem", { name: "Pause" }).click();
		await card().getByText("Paused").waitFor();
		expect((await planById(plan.id)).paused).toBe(1);
		// A paused plan isn't badged as overdue.
		expect(await card().locator("[data-overdue]").count()).toBe(0);

		await planMenu("Quarterly filter change");
		await app.page.getByRole("menuitem", { name: "Resume" }).click();
		await expect.poll(async () => (await planById(plan.id)).paused).toBe(0);

		const entries = await planActivity(plan.id, since);
		expect(entries.map((entry) => [entry.action, JSON.parse(entry.changes!)])).toEqual([
			["updated", { description: ["Quarterly filter check", "Quarterly filter change"] }],
			["updated", { paused: [false, true] }],
			["updated", { paused: [true, false] }],
		]);
		plan = await planById(plan.id);
	});
});

describe("the due list, in North", () => {
	test("shows the active plans due within 30 days by default, the overdue ones on request, and finds a plan by its unit", async () => {
		await app.go("/maintenance");
		expect(await app.rowCount()).toBe(await activeDueBefore(north.id, daysFromToday(SOON_DAYS)));
		await app.page.getByRole("combobox", { name: "Due" }).selectOption("overdue");
		await app.page.waitForURL((url) => url.searchParams.get("due") === "overdue");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await activeDueBefore(north.id, today));
		await app.page.getByRole("combobox", { name: "Due" }).selectOption("all");
		await app.page.waitForURL((url) => url.searchParams.get("due") === "");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			Number(
				await value(
					`select count(*) from maintenance_plan where organization_id = ? and paused = 0`,
					[north.id],
				),
			),
		);

		// It finds the plan by its unit's serial number.
		await app.go(`/maintenance?q=${unit.serial_number}`);
		const row = app.page.locator('[data-slot="data-table"] tbody tr').first();
		await row.getByText("Quarterly filter change").waitFor();
		expect(await row.innerText()).toContain("Every 3 months");
		expect(await row.locator("[data-overdue]").count()).toBe(1);
	});

	test("fits a phone's screen, the toolbar's actions wrapping", async () => {
		await onPhone(app.page, async () => {
			await app.go("/maintenance");
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	test("creates an order for each selected plan, and moves each plan on one interval", async () => {
		const { page } = app;
		const picked = await rows<Plan & { serial_number: string; customer_id: number }>(
			`select p.*, e.serial_number, e.customer_id from maintenance_plan p
			 join equipment e on e.id = p.equipment_id
			 where p.organization_id = ? and p.paused = 0 and p.next_due_on < ?
			 order by p.next_due_on, p.id limit 2`,
			[north.id, dayKey(today)],
		);
		expect(picked[0].id).toBe(plan.id);
		const ordersBefore = Number(
			await value(`select coalesce(max(id), 0) from "order" where organization_id = ?`, [north.id]),
		);
		const since = await lastActivityId();

		await app.go("/maintenance?due=overdue");
		const shown = page.locator('[data-slot="data-table"] tbody tr');
		await shown.nth(0).getByRole("checkbox", { name: "Select row" }).click();
		await shown.nth(1).getByRole("checkbox", { name: "Select row" }).click();
		await page
			.getByRole("region", { name: "Actions on the selected rows" })
			.getByRole("button", { name: "Create orders" })
			.click();
		const confirm = page.getByRole("alertdialog");
		await confirm.getByText("Create orders for 2 plans?").waitFor();
		await confirm.getByRole("button", { name: "Create orders" }).click();
		await app.toast("2 created");

		const created = await rows<{
			id: number;
			number: string;
			customer_id: number;
			/** Its units' ids, comma-separated: the plan's one. */
			units: string;
			type: string;
			status: string;
			priority: string;
			description: string;
			engineer_id: number | null;
			scheduled_for: number | null;
		}>(
			`select id, number, customer_id, type, status, priority, description, engineer_id,
			 scheduled_for, (select group_concat(equipment_id) from order_unit where order_id = o.id)
			 as units from "order" o where organization_id = ? and id > ? order by id`,
			[north.id, ordersBefore],
		);
		expect(created).toHaveLength(2);
		for (const was of picked) {
			const order = created.find((o) => o.units === String(was.equipment_id))!;
			expect(order).toMatchObject({
				customer_id: was.customer_id,
				type: was.order_type,
				description: was.description,
				status: "quote",
				priority: "normal",
				engineer_id: null,
				scheduled_for: null,
			});
			const now = await planById(was.id);
			const next = advanceDueDate(
				Temporal.PlainDate.from(was.next_due_on),
				was.interval_months,
				was.anchor_day,
			);
			expect(now).toMatchObject({
				next_due_on: dayKey(next),
				last_order_id: order.id,
				last_order_organization_id: north.id,
			});
			const entries = await planActivity(was.id, since);
			expect(entries.map((entry) => [entry.action, JSON.parse(entry.changes!)])).toEqual([
				[
					"updated",
					{
						nextDueOn: [was.next_due_on, next.toString()],
						lastOrder: [null, order.number],
					},
				],
			]);
			expect(
				await value(
					`select action from activity where subject_type = 'order' and subject_id = ? and id > ?`,
					[String(order.id), since],
				),
			).toBe("created");
		}
		// Ours was due 400 days ago, so it's still overdue after one quarter.
		plan = await planById(plan.id);
	});

	test("deleting the order later doesn't move the plan back", async () => {
		const { page } = app;
		const number = String(
			await value(`select number from "order" where id = ?`, [plan.last_order_id]),
		);
		await app.go(`/orders/${number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/orders");
		const after = await planById(plan.id);
		expect(after).toMatchObject({
			next_due_on: plan.next_due_on,
			last_order_id: null,
			last_order_organization_id: null,
		});
	});
});

describe("the dashboard and the equipment list, in North", () => {
	test("the dashboard counts the plans overdue and due within 30 days", async () => {
		await app.go("/");
		const overview = app.page.locator("[data-maintenance-overview]");
		await overview.waitFor();
		const overdue = await activeDueBefore(north.id, today);
		const soon = await activeDueBefore(north.id, daysFromToday(SOON_DAYS), today);
		const text = await overview.innerText();
		expect(text).toMatch(new RegExp(`Overdue\\s+${overdue}\\b`));
		expect(text).toMatch(new RegExp(`Due within 30 days\\s+${soon}\\b`));
		await overview.locator('[data-range="overdue"]').click();
		await app.page.waitForURL((url) => url.pathname === "/maintenance");
		expect(new URL(app.page.url()).searchParams.get("due")).toBe("overdue");
	});

	/** The earliest due date of each unit's active plans, in SQL. */
	const nextDue = `(select min(p.next_due_on) from maintenance_plan p
		where p.equipment_id = e.id and p.paused = 0 and p.organization_id = e.organization_id)`;

	test("the equipment list sorts by the next maintenance", async () => {
		await app.go("/equipment");
		await app.sortBy("Next maintenance", "ascending");
		expect(app.page.url()).toContain("sort=next-maintenance");
		const [first] = await rows<{ serial_number: string }>(
			`select e.serial_number from equipment e where e.organization_id = ? and ${nextDue} is not null
			 order by ${nextDue}, e.id limit 1`,
			[north.id],
		);
		const firstRow = app.page.locator('[data-slot="data-table"] tbody tr').first();
		expect(await firstRow.innerText()).toContain(first.serial_number);
		expect(await firstRow.locator("[data-overdue]").count()).toBe(1);
	});

	test("and filters by it: overdue, or no plan", async () => {
		const { page } = app;
		await app.go("/equipment");
		await app.openFilter("Next maintenance");
		await page.getByRole("option", { name: /^Overdue/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("next-maintenance") === "overdue");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			Number(
				await value(
					`select count(*) from equipment e where e.organization_id = ? and ${nextDue} < ?`,
					[north.id, dayKey(today)],
				),
			),
		);
		await app.go("/equipment?next-maintenance=none");
		expect(await app.rowCount()).toBe(
			Number(
				await value(
					`select count(*) from equipment e where e.organization_id = ? and ${nextDue} is null`,
					[north.id],
				),
			),
		);
	});
});

describe("a contract's page, in North", () => {
	test("lists its covered units' plans, and adds one to each covered unit without one", async () => {
		const { page } = app;
		const [contract] = await rows<{ id: number; number: string }>(
			`select c.id, c.number from contract c where c.organization_id = ?
			 and exists (select 1 from contract_equipment ce where ce.contract_id = c.id
			   and not exists (select 1 from maintenance_plan p where p.equipment_id = ce.equipment_id))
			 order by c.id limit 1`,
			[north.id],
		);
		const covered = await rows<{ id: number; plans: number }>(
			`select ce.equipment_id as id,
			 (select count(*) from maintenance_plan p where p.equipment_id = ce.equipment_id) as plans
			 from contract_equipment ce where ce.contract_id = ? order by ce.equipment_id`,
			[contract.id],
		);
		const without = covered.filter((unit) => !unit.plans);

		await app.go(`/contracts/${contract.number}`);
		const contractCard = page.locator("[data-maintenance-contract]");
		await contractCard.waitFor();
		await contractCard
			.getByRole("button", { name: "Add a plan to each covered unit without one" })
			.click();
		const form = dialog();
		await form.getByLabel("Description").fill("Jaarlijkse servicebeurt");
		await form.getByLabel("Interval in months").fill("12");
		await app.submit(form.getByRole("button", { name: "Add plan" }));
		await app.toast(`${without.length} plan${without.length === 1 ? "" : "s"} added`);
		await contractCard.getByText("Every covered unit has a plan.").waitFor();

		const due = advanceDueDate(today, 12);
		for (const unit of covered) {
			const plans = await plansOf(unit.id);
			if (unit.plans) {
				expect(plans).toHaveLength(unit.plans);
				continue;
			}
			expect(plans).toEqual([
				expect.objectContaining({
					description: "Jaarlijkse servicebeurt",
					order_type: "maintenance",
					interval_months: 12,
					next_due_on: dayKey(due),
				}),
			]);
		}
	});
});
