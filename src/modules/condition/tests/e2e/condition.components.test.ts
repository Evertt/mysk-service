/**
 * A unit's components in SHLTR's office, on the unit's page: the seeded ones with their articles
 * and conditions; a planner adds one with an article (whose shop points the dialog ticks), records
 * its condition as a correction (its status, and its unit's, following on the cards) and removes
 * it; and the customer's portal shows a unit's components with their condition and advice. What
 * the server does with each change (numbering, points, changing and moving one, what's logged, the
 * article a rejected point suggests, another tenant's ids) is `components.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp, users } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { componentsOf, pageLocators, unitStates } from "./helpers.ts";

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
		const added = (await componentsOf(unit.id)).at(-1)!;
		expect(added.name).toBe("Kabelset");
		made = { id: added.id, number: added.number };
		await row(made.number).waitFor();
		expect(await row(made.number).innerText()).toContain(
			`${made.number} · art. SD-002 · ${shop.length} points`,
		);
	});

	test("its condition is recorded as a correction, and its status and its unit's follow", async () => {
		await row(made.number).getByRole("button", { name: "Actions for Kabelset" }).click();
		await app.page.getByRole("menuitem", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("35");
		await dialog().getByLabel("Advice").fill("Kabelset vervangen (SD-002).");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
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

	test("it's removed, once that's confirmed", async () => {
		await row(made.number).getByRole("button", { name: "Actions for Kabelset" }).click();
		await app.page.getByRole("menuitem", { name: "Remove" }).click();
		await app.page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
		await app.toast("Component removed");
		await expect.poll(() => row(made.number).count()).toBe(0);
	});
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
