/**
 * The checklists in SHLTR's office: an order's page shows each unit's checklist (rejected points
 * first), its work order prints them, a unit's page has its inspection status and history, the
 * equipment list a column of the status. What the server reads for them (each status, the list's
 * filters and sort) is `order-checklists.spec.ts`'s; what the order form does with an order's
 * checklists (keeping answered ones, taking unanswered ones along) is `checklists.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users } from "#e2e/app.ts";
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
		// The seed signs SHLTR's done work with an engineer off, by the engineer and the customer's
		// contact: their names under their signatures, or room for both.
		const [signoff] = await rows<{ signer_name: string; engineer_name: string }>(
			`select signer_name, engineer_name from order_signoff where order_id = ?
			 and engineer_signature is not null`,
			[order.id],
		);
		expect(signoff, "the seed signed the order off").toBeDefined();
		expect(await workOrder.getByText("Not signed").count()).toBe(0);
		expect(await workOrder.locator("[data-signatures] img").count()).toBe(2);
		const signatures = await workOrder.locator("[data-signatures]").innerText();
		expect(signatures).toContain(signoff.signer_name);
		expect(signatures).toContain(signoff.engineer_name);
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
		// One that was rejected; each status's unit and its history is `order-checklists.spec.ts`'s.
		const unit = (await statuses()).find((each) => each.status === "rejected")!;
		expect(unit, "a unit whose inspection was rejected").toBeDefined();
		await app.go(`/equipment/${unit.serial_number}`);
		const cardOf = page().locator("[data-unit-inspections]");
		await cardOf.waitFor();
		expect(await cardOf.locator("[data-inspection]").getAttribute("data-inspection")).toBe(
			"rejected",
		);
		const history = await rows<{ number: string }>(
			`select o.number from checklist c join "order" o on o.id = c.order_id
			 join equipment e on e.id = c.equipment_id where e.serial_number = ? and e.organization_id = ?`,
			[unit.serial_number, shltr.id],
		);
		expect(await cardOf.locator("[data-history]").count()).toBe(history.length);
		// Opening one shows what was found.
		await cardOf.locator("[data-history]").first().click();
		const dialog = page().getByRole("dialog");
		await dialog.locator("[data-checklist-points]").waitFor();
		expect(await dialog.locator("li[data-point]").count()).toBeGreaterThan(0);
		await page().keyboard.press("Escape");
	});

	test("the equipment list shows each unit's status, and filters by it", async () => {
		// One filter; each of them, and the sort, are `order-checklists.spec.ts`'s.
		const count = (await statuses()).filter((each) => each.status === "expiring").length;
		expect(count).toBeGreaterThan(0);
		await app.go("/equipment?inspection=expiring");
		expect(await app.rowCount()).toBe(count);
		const table = page().locator('[data-slot="data-table"] tbody');
		expect(await table.locator('[data-inspection="expiring"]').count()).toBe(
			await table.locator("tr").count(),
		);
	});
});
