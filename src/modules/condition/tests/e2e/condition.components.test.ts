/**
 * A unit's components in SHLTR's office, on the unit's page: the seeded ones with their articles
 * and conditions; a planner adds one with an article (whose shop points check it by default),
 * changes it, records its condition as a correction (its status, and its unit's, following),
 * moves it and removes it, each change logged against the unit. A rejected point on an order's
 * checklist that checks a component suggests the component's article first, and the customer's
 * portal shows a unit's components with their condition and advice.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp, users, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import {
	checkpointsOf,
	componentConditionsOf,
	componentsOf,
	pageLocators,
	unitStates,
} from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const { dialog } = pageLocators(app);

const card = () => app.page.locator("[data-unit-components]");
const row = (number: string) => card().locator(`[data-component="${number}"]`);

/** The tenant's unit by name and customer. */
const unitNamed = async (name: string, customer: string) =>
	(
		await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? and e.name = ? and c.name = ? and e.status <> 'decommissioned'
			 order by e.id limit 1`,
			[shltr.id, name, customer],
		)
	)[0];

/** The tenant's material by SKU. */
const materialOf = (sku: string) =>
	value<number>(`select id from material where organization_id = ? and sku = ?`, [shltr.id, sku]);

/** The tenant's template points by text. */
const pointOf = (text: string) =>
	value<number>(`select id from checklist_template_item where organization_id = ? and text = ?`, [
		shltr.id,
		text,
	]);

describe("a unit's components", () => {
	let unit: { id: number; serial_number: string };
	let made: { id: number; number: string };

	test("are on its page with their articles, conditions and statuses", async () => {
		const door = await unitNamed("Sectionaaldeur laaddok 07", "Riedel B.V.");
		await app.go(`/equipment/${door.serial_number}`);
		await row("OC-1041").waitFor();
		expect(await row("OC-1041").innerText()).toContain("Torsieveerpakket");
		expect(await row("OC-1041").innerText()).toContain("OC-1041 · art. SD-001 · 2 points");
		expect(await row("OC-1041").locator("[data-condition]").getAttribute("data-condition")).toBe(
			"22",
		);
		expect(await row("OC-1041").locator("[data-status]").getAttribute("data-status")).toBe(
			"critical",
		);
		expect(await row("OC-1042").innerText()).toContain("Staaldraadkabels");
		// In their order.
		const numbers = await card()
			.locator("[data-component]")
			.evaluateAll((items: HTMLElement[]) => items.map((item) => item.dataset.component));
		expect(numbers).toEqual(["OC-1041", "OC-1042"]);
		// The unit's status takes its worst component's in.
		const state = (await unitStates(shltr.id)).find((each) => each.id === door.id)!;
		expect(state.status).toBe("critical");
	});

	test("one is added with an article, whose shop points check it unless told otherwise", async () => {
		unit = await unitNamed("Sectionaaldeur D-09", "Riedel B.V.");
		await app.go(`/equipment/${unit.serial_number}`);
		await row("OC-1043").waitFor();
		await card().getByRole("button", { name: "Add component" }).click();
		await dialog().getByLabel("Name").fill("Kabelset");
		await dialog().getByLabel("Article").selectOption({ label: "SD-002 · Kabelset compleet" });
		// The shop's points of SD-002 are checked.
		const shop = await rows<{ text: string }>(
			`select i.text from shop_product_checkpoint k join shop_product p on p.id = k.product_id
			 join material m on m.id = p.material_id join checklist_template_item i on i.id = k.template_item_id
			 where m.organization_id = ? and m.sku = 'SD-002' order by i.position`,
			[shltr.id],
		);
		expect(shop.length).toBeGreaterThan(0);
		for (const { text } of shop) {
			expect(await dialog().getByLabel(text).isChecked(), text).toBe(true);
		}
		await dialog().getByRole("button", { name: "Save" }).click();
		await app.toast("Component saved");
		const after = await componentsOf(unit.id);
		const added = after.at(-1)!;
		expect(added).toMatchObject({
			organization_id: shltr.id,
			name: "Kabelset",
			material_id: await materialOf("SD-002"),
			position: after.length - 1,
		});
		// Numbered after the mockup's codes.
		expect(added.number).toBe("OC-4005");
		made = { id: added.id, number: added.number };
		expect(await checkpointsOf(added.id)).toEqual(
			(await Promise.all(shop.map(({ text }) => pointOf(text)))).toSorted((a, b) => a - b),
		);
		await row(made.number).waitFor();
		const [entry] = await rows<{ action: string; subject_label: string; parent_id: string }>(
			`select action, subject_label, parent_id from activity where organization_id = ?
			 and subject_type = 'component' order by id desc limit 1`,
			[shltr.id],
		);
		expect(entry).toEqual({
			action: "created",
			subject_label: `${unit.serial_number} · OC-4005 · Kabelset`,
			parent_id: String(unit.id),
		});
	});

	test("its name and points are changed", async () => {
		await row(made.number).getByRole("button", { name: "Actions for Kabelset" }).click();
		await app.page.getByRole("menuitem", { name: "Edit" }).click();
		await dialog().getByLabel("Name").fill("Staaldraadkabels links");
		const cables = "Staaldraadkabels vrij van rafels en corrosie";
		const others = (await checkpointsOf(made.id)).length;
		await dialog().getByLabel("Veerbreukbeveiliging en kabelbreukbeveiliging getest").uncheck();
		expect(await dialog().getByLabel(cables).isChecked()).toBe(true);
		await dialog().getByRole("button", { name: "Save" }).click();
		await app.toast("Component saved");
		const [changed] = (await componentsOf(unit.id)).filter((each) => each.id === made.id);
		expect(changed.name).toBe("Staaldraadkabels links");
		expect(await checkpointsOf(made.id)).toEqual([await pointOf(cables)]);
		expect(others).toBe(2);
		await expect.poll(() => row(made.number).innerText()).toContain("Staaldraadkabels links");
	});

	test("its condition is recorded as a correction, and its status and its unit's follow", async () => {
		await row(made.number)
			.getByRole("button", { name: "Actions for Staaldraadkabels links" })
			.click();
		await app.page.getByRole("menuitem", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("35");
		await dialog().getByLabel("Advice").fill("Kabelset vervangen (SD-002).");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		expect(await componentConditionsOf(made.id)).toEqual([
			expect.objectContaining({
				score: 35,
				advice: "Kabelset vervangen (SD-002).",
				source: "office",
			}),
		]);
		await row(made.number).locator('[data-condition="35"]').waitFor();
		const state = (await unitStates(shltr.id)).find((each) => each.id === unit.id)!;
		const part = state.components.find((each) => each.id === made.id)!;
		expect(await row(made.number).locator("[data-status]").getAttribute("data-status")).toBe(
			part.status,
		);
		expect(part.concern).toBe("critical");
		expect(state.concern).toBe("critical");
		expect(
			await app.page.locator("[data-unit-condition] [data-status]").getAttribute("data-status"),
		).toBe(state.status);
	});

	test("it's moved up among its unit's components", async () => {
		const before = (await componentsOf(unit.id)).map((each) => each.number);
		expect(before.at(-1)).toBe(made.number);
		await row(made.number).getByRole("button", { name: "Move up" }).click();
		await expect
			.poll(async () => (await componentsOf(unit.id)).map((each) => each.number))
			.toEqual([...before.slice(0, -2), made.number, before.at(-2)]);
		await expect
			.poll(() =>
				card()
					.locator("[data-component]")
					.evaluateAll((items: HTMLElement[]) => items.map((item) => item.dataset.component)),
			)
			.toEqual([...before.slice(0, -2), made.number, before.at(-2)]);
	});

	test("it's removed with its conditions, and logged", async () => {
		await row(made.number)
			.getByRole("button", { name: "Actions for Staaldraadkabels links" })
			.click();
		await app.page.getByRole("menuitem", { name: "Remove" }).click();
		await app.page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await app.toast("Component removed");
		expect((await componentsOf(unit.id)).map((each) => each.id)).not.toContain(made.id);
		expect(await componentConditionsOf(made.id)).toEqual([]);
		expect(await row(made.number).count()).toBe(0);
		expect(
			await value<string>(
				`select action from activity where organization_id = ? and subject_type = 'component'
				 and subject_id = ? order by id desc limit 1`,
				[shltr.id, String(made.id)],
			),
		).toBe("deleted");
	});
});

test("a rejected point that checks a component suggests its article first", async () => {
	const { page } = app;
	// A done order's rejected point, on a unit without components.
	const [found] = await rows<{ number: string; serial_number: string; text: string }>(
		`select o.number, e.serial_number, r.text from checklist_result r
		 join checklist c on c.id = r.checklist_id join "order" o on o.id = c.order_id
		 join equipment e on e.id = c.equipment_id
		 join checklist_template_item i on i.id = r.template_item_id and i.template_id = c.template_id
		 where r.organization_id = ? and r.result = 'nok' and e.status <> 'decommissioned'
		 and o.status in ('completed', 'invoiced')
		 and not exists (select 1 from component p where p.equipment_id = e.id)
		 order by o.id desc limit 1`,
		[shltr.id],
	);
	expect(found, "SHLTR has a rejected point on a unit without components").toBeDefined();
	// A component the point checks, its article one the shop links to no point.
	await app.go(`/equipment/${found.serial_number}`);
	await card().getByRole("button", { name: "Add component" }).click();
	await dialog().getByLabel("Name").fill("Isolatiepaneel");
	await dialog().getByLabel("Article").selectOption({ label: "SD-007 · Isolatiepaneel compleet" });
	await dialog().getByLabel(found.text, { exact: true }).check();
	await dialog().getByRole("button", { name: "Save" }).click();
	await app.toast("Component saved");

	await app.go(`/orders/${found.number}`);
	const parts = page.locator("[data-suggested-parts] [data-suggested-part]");
	await parts.first().waitFor();
	expect(await parts.first().getAttribute("data-suggested-part")).toBe("SD-007");
	expect(await parts.first().innerText()).toContain(found.text);
});

test("the customer portal's home shows a unit's components, with their condition and advice", async () => {
	const door = await unitNamed("Sectionaaldeur laaddok 07", "Riedel B.V.");
	const { page } = await signedInPage(app, users.riedel);
	try {
		await page.goto(`${baseURL}/portal`);
		const parts = page.locator(
			`[data-client-attention] [data-unit-components="${door.serial_number}"]`,
		);
		const springs = parts.locator('[data-component="OC-1041"]');
		await springs.waitFor();
		const text = await springs.innerText();
		expect(text).toContain("Torsieveerpakket");
		expect(text).toContain("Veerpakket vervangen (SD-001) — cyclusteller boven 90%.");
		expect(await springs.locator("[data-condition]").getAttribute("data-condition")).toBe("22");
		expect(await parts.locator("[data-component]").count()).toBe(2);
	} finally {
		await page.context().close();
	}
});
