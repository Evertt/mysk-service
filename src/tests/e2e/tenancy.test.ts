/**
 * Organizations and modules: the admin starts in North and switches to South (its numbers, its
 * modules), which is remembered, also from a module's 404 page; an owner switches a module on and
 * off, the sidebar following. What the switches refuse (an organization one isn't a member of, a
 * form that switches nothing, a planner) is `routes/(app)/settings/organizations.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value, quiet } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const openOrders = (organizationId: string) =>
	value<number>(
		`select count(*) from "order" where organization_id = ? and status in ('quote', 'scheduled', 'in_progress')`,
		[organizationId],
	);
const header = () => app.page.locator('[data-sidebar="header"]').innerText();
const sidebarLink = (name: string) =>
	app.page.locator('[data-sidebar="content"]').getByRole("link", { name });
/** The card on the settings page for a module. */
const moduleCard = (label: string) => app.page.locator("div.rounded-lg.border", { hasText: label });
/**
 * The log entries about switching a module on or off in an organization after the activity entry
 * `since`, oldest first (other files switch South's modules on the same worker too).
 */
const moduleEntries = (moduleId: string, organizationId: string, since: number) =>
	rows<{ action: string }>(
		`select action from activity where organization_id = ? and subject_type = 'module'
		 and subject_id = ? and id > ? order by id`,
		[organizationId, moduleId, since],
	);

describe("organizations", () => {
	test("the admin starts in North; switching to South shows South's numbers, without its missing modules", async () => {
		await app.go("/");
		expect(await header()).toContain(north.name);
		expect(
			await app.page.getByText("Open orders", { exact: true }).locator("..").innerText(),
		).toContain(String(await openOrders(north.id)));
		expect(await sidebarLink("Service contracts").count()).toBe(1);

		await app.switchOrganization(south.name);
		expect(await header()).toContain(south.name);
		expect(
			await app.page.getByText("Open orders", { exact: true }).locator("..").innerText(),
		).toContain(String(await openOrders(south.id)));
		expect(await sidebarLink("Service contracts").count()).toBe(0);
		expect((await app.go("/contracts"))?.status()).toBe(404);
	});

	test("the switch is remembered across page loads", async () => {
		await app.page.reload();
		await quiet(app.page);
		expect(await header()).toContain(south.name);
	});

	test("the switcher works on a module's 404 page too", async () => {
		expect((await app.go("/contracts"))?.status()).toBe(404);
		await app.switchOrganization(north.name);
		expect(await header()).toContain(north.name);
		await app.switchOrganization(south.name);
		expect(await header()).toContain(south.name);
	});
});

describe("modules", () => {
	const contracts = "Service contracts";
	let since = 0;

	test("an owner can enable a module for their organization", async () => {
		const { page } = app;
		await app.go("/settings");
		const card = moduleCard(contracts);
		expect(await card.innerText()).toContain("Disabled");
		since = await value<number>("select coalesce(max(id), 0) from activity");
		await app.submit(card.getByRole("button", { name: "Enable" }));
		await card.getByText(/Enabled since/).waitFor();
		expect(
			await rows(`select * from organization_module where organization_id = ? order by module_id`, [
				south.id,
			]),
		).toMatchObject([
			{ module_id: "contracts" },
			{ module_id: "invoices" },
			{ module_id: "materials" },
		]);
		expect(await moduleEntries("contracts", south.id, since)).toEqual([
			{ action: "module_enabled" },
		]);
		// The sidebar follows without a reload.
		await sidebarLink(contracts).waitFor();
		await app.go("/contracts");
		expect(await page.getByRole("heading", { name: "Service contracts" }).count()).toBe(1);
	});

	test("and disable it again", async () => {
		await app.go("/settings");
		const card = moduleCard(contracts);
		await app.submit(card.getByRole("button", { name: "Disable" }));
		await card.getByText("Disabled").waitFor();
		// South's own modules (invoicing, materials) stay.
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? order by module_id`,
				[south.id],
			),
		).toEqual([{ module_id: "invoices" }, { module_id: "materials" }]);
		expect(await sidebarLink(contracts).count()).toBe(0);
		expect((await app.go("/contracts"))?.status()).toBe(404);
		// One entry for each change, none for invoicing, which stayed.
		expect(await moduleEntries("contracts", south.id, since)).toEqual([
			{ action: "module_enabled" },
			{ action: "module_disabled" },
		]);
		expect(await moduleEntries("invoices", south.id, since)).toEqual([]);
	});
});
