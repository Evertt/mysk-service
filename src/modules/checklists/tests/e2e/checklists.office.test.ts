/**
 * The checklists in SHLTR's office: an order's page shows each unit's checklist (rejected points
 * first), its work order prints them, a unit's page has its inspection status and history, the
 * equipment list a column of the status; and the order form keeps a checklist that has answers.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, hydrated, organizations, rows, useApp, users, value } from "#e2e/app.ts";
import { addUnits, formUnits, orderUnits } from "#e2e/orders-helpers.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";
import { EXPIRING_DAYS } from "#modules/checklists/model.ts";

import { checklistsOfOrder, inspectionStatuses, resultsOf } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const page = () => app.page;

const today = Temporal.Now.plainDateISO();
const statuses = () =>
	inspectionStatuses(shltr.id, today.toString(), today.add({ days: EXPIRING_DAYS }).toString());

describe("a done inspection with rejected points", () => {
	let order: { id: number; number: string };

	test("shows each unit's checklist on the order's page, rejected points first", async () => {
		[order] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.organization_id = ? and o.type = 'inspection'
			 and exists (select 1 from checklist c join checklist_result r on r.checklist_id = c.id
				where c.order_id = o.id and r.result = 'nok')
			 order by (select count(*) from checklist c where c.order_id = o.id) desc, o.id limit 1`,
			[shltr.id],
		);
		await app.go(`/orders/${order.number}`);
		const cardOf = page().locator("[data-order-checklists]");
		await cardOf.waitFor();
		const checklists = await checklistsOfOrder(order.id);
		expect(await cardOf.locator("article[data-checklist]").count()).toBe(checklists.length);
		for (const checklist of checklists) {
			const points = await resultsOf(checklist.id);
			const rejected = points.filter((point) => point.result === "nok");
			const article = cardOf.locator(`article[data-checklist="${checklist.serial_number}"]`);
			expect(await article.locator("[data-outcome]").innerText()).toBe(
				rejected.length ? `${rejected.length} rejected` : "Approved",
			);
			const shown = await article
				.locator("li[data-point]")
				.evaluateAll((items) => items.map((item) => item.getAttribute("data-result")));
			expect(shown).toEqual([
				...rejected.map(() => "nok"),
				...points.filter((point) => point.result !== "nok").map((point) => point.result),
			]);
			for (const point of rejected) expect(await article.innerText()).toContain(point.remark!);
			if (checklist.remarks) expect(await article.innerText()).toContain(checklist.remarks);
		}
	});

	test("its work order has the order, every checklist, and room for the signatures", async () => {
		await page()
			.locator("[data-order-checklists]")
			.getByRole("link", { name: "Work order" })
			.click();
		await page().waitForURL((url) => url.pathname === `/checklists/work-orders/${order.number}`);
		const workOrder = page().locator(`[data-work-order="${order.number}"]`);
		await workOrder.waitFor();
		const checklists = await checklistsOfOrder(order.id);
		expect(await workOrder.locator("section[data-checklist]").count()).toBe(checklists.length);
		const text = await workOrder.innerText();
		expect(text).toContain(`Work order ${order.number}`);
		for (const checklist of checklists) expect(text).toContain(checklist.serial_number);
		// The seed's orders were signed on paper: none here.
		expect(await workOrder.getByText("Not signed").count()).toBe(2);
		// Each point under its group, in the template's order.
		const [first] = checklists;
		const sectionText = await workOrder
			.locator(`section[data-checklist="${first.serial_number}"]`)
			.innerText();
		let at = -1;
		for (const point of await resultsOf(first.id)) {
			const found = sectionText.indexOf(point.text, at + 1);
			expect(found, point.text).toBeGreaterThan(at);
			at = found;
		}
	});
});

describe("a unit's inspections", () => {
	test("its page shows the status of its latest inspection and its checklists per year", async () => {
		const all = await statuses();
		for (const status of ["rejected", "expired", "valid"]) {
			const unit = all.find((each) => each.status === status)!;
			expect(unit, status).toBeDefined();
			await app.go(`/equipment/${unit.serial_number}`);
			const cardOf = page().locator("[data-unit-inspections]");
			await cardOf.waitFor();
			expect(await cardOf.locator("[data-inspection]").getAttribute("data-inspection")).toBe(
				status,
			);
			const history = await rows<{ number: string }>(
				`select o.number from checklist c join "order" o on o.id = c.order_id
				 join equipment e on e.id = c.equipment_id where e.serial_number = ? and e.organization_id = ?`,
				[unit.serial_number, shltr.id],
			);
			expect(await cardOf.locator("[data-history]").count()).toBe(history.length);
		}
		// Opening one shows what was found.
		const cardOf = page().locator("[data-unit-inspections]");
		await cardOf.locator("[data-history]").first().click();
		const dialog = page().getByRole("dialog");
		await dialog.locator("[data-checklist-points]").waitFor();
		expect(await dialog.locator("li[data-point]").count()).toBeGreaterThan(0);
		await page().keyboard.press("Escape");
	});

	test("the equipment list shows each unit's status, and filters and sorts by it", async () => {
		const all = await statuses();
		for (const status of ["valid", "expiring", "expired", "rejected"]) {
			const count = all.filter((each) => each.status === status).length;
			expect(count, status).toBeGreaterThan(0);
			await app.go(`/equipment?inspection=${status}`);
			expect(await app.rowCount(), status).toBe(count);
			expect(
				await page()
					.locator(`[data-slot="data-table"] tbody [data-inspection="${status}"]`)
					.count(),
			).toBeGreaterThan(0);
		}
		await app.go("/equipment");
		await app.sortBy("Inspection", "ascending");
		const firstRow = page().locator('[data-slot="data-table"] tbody tr').first();
		const first = await firstRow.locator("[data-inspection]").getAttribute("data-inspection");
		// Worst first. Other files complete inspections meanwhile, so the worst status there is
		// is read again, before and after the page.
		const worst = (list: { status: string }[]) =>
			["expired", "rejected", "expiring", "valid"].find((status) =>
				list.some((each) => each.status === status),
			);
		expect([worst(all), worst(await statuses())]).toContain(first);
	});
});

describe("an order's units in the order form", () => {
	let order: { id: number; number: string };

	test("a unit whose checklist has answers stays on the order", async () => {
		[order] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.organization_id = ? and o.status = 'scheduled'
			 and o.type = 'inspection' and (select count(*) from checklist c where c.order_id = o.id) >= 2
			 and o.engineer_id <> (select e.id from engineer e join user u on u.id = e.user_id
				where u.email = ?)
			 order by o.id limit 1`,
			[shltr.id, users.shltrEngineer],
		);
		// Lev gets it, starts on it and answers a point, as he would on site.
		await app.go(`/orders/${order.number}/edit`);
		await page().getByLabel("Engineer").selectOption({ label: "Lev Hoekstra" });
		await page().getByLabel("Status").selectOption("in_progress");
		await page().getByRole("button", { name: "Save order" }).click();
		await page().waitForURL((url) => url.pathname === `/orders/${order.number}`);
		const [answered] = await checklistsOfOrder(order.id);
		const [firstPoint] = await resultsOf(answered.id);
		const { page: lev } = await signedInPage(app, users.shltrEngineer);
		try {
			await lev.goto(`${baseURL}/my/${order.number}`);
			await hydrated(lev);
			await lev
				.locator(`[data-field-checklist="${answered.serial_number}"]`)
				.locator(`[data-point="${firstPoint.text}"]`)
				.getByRole("button", { name: "OK" })
				.click();
			await expect.poll(async () => (await resultsOf(answered.id))[0].result).toBe("ok");
		} finally {
			await lev.context().close();
		}

		const units = await orderUnits(order.id);
		await app.go(`/orders/${order.number}/edit`);
		await page()
			.getByRole("list", { name: "Units" })
			.locator(":scope > li")
			.nth(units.indexOf(answered.equipment_id))
			.getByRole("button", { name: /^Remove/ })
			.click();
		await app.submit(page().getByRole("button", { name: "Save order" }));
		expect((await app.issues()).join(" ")).toContain("have answers already");
		expect(await orderUnits(order.id)).toEqual(units);
		expect(await checklistsOfOrder(order.id)).toHaveLength(units.length);
	});

	test("one without answers goes with its checklist; a unit put on gets one", async () => {
		const checklists = await checklistsOfOrder(order.id);
		const [, unanswered] = checklists;
		const [extra] = await rows<{ id: number }>(
			`select e.id from equipment e join checklist_template_category t on t.category_id = e.category_id
			 where e.customer_id = (select customer_id from "order" where id = ?)
			 and e.id not in (select equipment_id from order_unit where order_id = ?) order by e.id limit 1`,
			[order.id, order.id],
		);
		await app.go(`/orders/${order.number}/edit`);
		const units = await formUnits(app);
		await page()
			.getByRole("list", { name: "Units" })
			.locator(":scope > li")
			.nth(units.indexOf(unanswered.equipment_id))
			.getByRole("button", { name: /^Remove/ })
			.click();
		await addUnits(app, { id: extra.id });
		await page().getByRole("button", { name: "Save order" }).click();
		await page().waitForURL((url) => url.pathname === `/orders/${order.number}`);
		const after = await checklistsOfOrder(order.id);
		expect(after.map((checklist) => checklist.equipment_id)).not.toContain(unanswered.equipment_id);
		expect(after.map((checklist) => checklist.equipment_id)).toContain(extra.id);
		// The ones it kept are the same records, answers and all.
		expect(after.find((checklist) => checklist.id === checklists[0].id)).toBeDefined();
		expect(
			await value(`select count(*) from checklist_result where checklist_id = ?`, [unanswered.id]),
		).toBe(0);
	});

	test("it stays an inspection while a checklist has answers", async () => {
		await app.go(`/orders/${order.number}/edit`);
		await page().getByLabel("Type").selectOption("repair");
		await app.submit(page().getByRole("button", { name: "Save order" }));
		expect((await app.issues()).join(" ")).toContain("the order stays an inspection");
		expect(await value(`select type from "order" where id = ?`, [order.id])).toBe("inspection");
	});
});
