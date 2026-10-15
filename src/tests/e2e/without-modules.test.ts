import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";

const { south } = organizations;
const app = useApp();

/** Every module's sidebar label. */
const moduleLabels = [
	"Service contracts",
	"Invoicing",
	"Maintenance plans",
	"Materials",
	"Schedule",
];

/** A module's card on the settings page. */
const moduleCard = (id: string) => app.page.locator(`[data-module="${id}"]`);
const southModules = async () =>
	(
		await rows<{ module_id: string }>(
			`select module_id from organization_module where organization_id = ? order by module_id`,
			[south.id],
		)
	).map((row) => row.module_id);

/** South's modules as seeded, switched back on at the end. */
let seeded: string[] = [];

// Core needs no module to work: South, with every module switched off, still has all its pages.
describe("an organization without modules", () => {
	test("an owner switches every module off", async () => {
		await app.switchOrganization(south.name);
		seeded = await southModules();
		expect(seeded.length).toBeGreaterThan(0);
		await app.go("/settings");
		for (const id of seeded) {
			const card = moduleCard(id);
			await app.submit(card.getByRole("button", { name: "Disable" }));
			await card.getByText("Disabled").waitFor();
		}
		expect(await southModules()).toEqual([]);
	});

	test("the sidebar has none of them", async () => {
		await app.go("/");
		const sidebar = app.page.locator('[data-sidebar="content"]');
		for (const label of moduleLabels) {
			expect(await sidebar.getByRole("link", { name: label }).count(), label).toBe(0);
		}
	});

	test("every core page works, without a part that failed", async () => {
		const ofSouth = (sql: string) => value<string | number>(sql, [south.id]);
		const order = await ofSouth(`select number from "order" where organization_id = ?`);
		const customer = await ofSouth(`select code from customer where organization_id = ?`);
		const unit = await ofSouth(`select serial_number from equipment where organization_id = ?`);
		const engineer = await ofSouth(`select id from engineer where organization_id = ?`);
		const pages = [
			"/",
			"/orders",
			`/orders/${order}`,
			"/orders/new",
			"/customers",
			`/customers/${customer}`,
			"/equipment",
			`/equipment/${unit}`,
			"/engineers",
			`/engineers/${engineer}`,
			"/activity",
			"/settings",
		];
		for (const path of pages) {
			const response = await app.go(path);
			expect(response?.status(), path).toBe(200);
			expect(await app.page.locator("[data-extension-failed]").count(), path).toBe(0);
		}
	});

	test("switching them back on brings back what South had", async () => {
		await app.go("/settings");
		for (const id of seeded) {
			const card = moduleCard(id);
			await app.submit(card.getByRole("button", { name: "Enable" }));
			await card.getByText(/Enabled since/).waitFor();
		}
		expect(await southModules()).toEqual(seeded);
	});
});
