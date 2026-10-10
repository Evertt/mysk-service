import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users, value } from "./app.ts";

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
	test("the admin starts in North, with North's numbers and modules", async () => {
		await app.go("/");
		expect(await header()).toContain(north.name);
		expect(
			await app.page.getByText("Open orders", { exact: true }).locator("..").innerText(),
		).toContain(String(await openOrders(north.id)));
		expect(await sidebarLink("Service contracts").count()).toBe(1);
	});

	test("switching to South shows South's numbers, without its missing modules", async () => {
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
		await app.page.waitForLoadState("networkidle");
		expect(await header()).toContain(south.name);
	});

	test("switching to an organization you're not a member of is refused", async () => {
		const { page } = app;
		// From a page that exists: on a module's 404 page, the module guard answers a refused form too.
		await app.go("/");
		await page.locator('[data-sidebar="header"] button').first().click();
		const result = await app.expectingErrors(async () => {
			// Point North's entry at an organization the admin doesn't belong to.
			const entry = page.getByRole("menuitem", { name: north.name });
			await entry.evaluate((element) => {
				element.closest("form")!.querySelector<HTMLInputElement>('input[type="hidden"]')!.value =
					"org-elsewhere";
			});
			const [response] = await Promise.all([
				page.waitForResponse((r) => r.request().method() === "POST"),
				entry.click(),
			]);
			return response.status();
		});
		expect(result).toBe(403);
		await app.go("/");
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
		).toMatchObject([{ module_id: "contracts" }, { module_id: "invoicing" }]);
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
		// South's own module (invoicing) stays.
		expect(
			await rows(`select module_id from organization_module where organization_id = ?`, [south.id]),
		).toEqual([{ module_id: "invoicing" }]);
		expect(await sidebarLink(contracts).count()).toBe(0);
		expect((await app.go("/contracts"))?.status()).toBe(404);
		// One entry for each change, none for invoicing, which stayed.
		expect(await moduleEntries("contracts", south.id, since)).toEqual([
			{ action: "module_enabled" },
			{ action: "module_disabled" },
		]);
		expect(await moduleEntries("invoicing", south.id, since)).toEqual([]);
	});

	test("a submission that switches nothing is refused, saying so", async () => {
		await app.go("/settings");
		const card = moduleCard(contracts);
		const rowsBefore = await rows(
			`select module_id from organization_module where organization_id = ? order by module_id`,
			[south.id],
		);
		// Other files on this lane may log entries meanwhile: count only module switches of South's.
		const switches = (since: number) =>
			rows(
				`select subject_id, action from activity where organization_id = ? and subject_type = 'module'
				 and action in ('module_enabled', 'module_disabled') and id > ?`,
				[south.id, since],
			);
		const baseline = await value<number>("select coalesce(max(id), 0) from activity");
		// The form as a tampered page would send it: without the module it switches.
		await card
			.locator("form input[hidden]")
			.evaluateAll((inputs) => inputs.forEach((input) => input.remove()));
		await app.submit(card.getByRole("button", { name: "Enable" }));
		expect(await card.locator('[data-slot="field-error"]').innerText()).toContain(
			"Choose a module to switch on or off.",
		);
		expect(
			await rows(
				`select module_id from organization_module where organization_id = ? order by module_id`,
				[south.id],
			),
		).toEqual(rowsBefore);
		expect(await switches(baseline)).toEqual([]);
	});

	test("a member can't change modules", async () => {
		const { page } = app;
		// The toggle form as an owner sees it, to submit it as a member.
		await app.switchOrganization(north.name);
		await app.go("/settings");
		const form = await moduleCard(contracts)
			.locator("form")
			.evaluate((element: HTMLFormElement) => ({
				action: element.action,
				fields: [...new FormData(element)].map(([name, value]) => [name, value as string]),
			}));
		// The Disable button's form carries the module to switch off.
		expect(form.fields).toEqual([[expect.stringContaining("disable[]"), "contracts"]]);

		await page.context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/settings");
		expect(await header()).toContain(north.name);
		expect(await page.getByText("Owners and admins can change these.").count()).toBe(1);
		expect(await moduleCard(contracts).getByRole("button").count()).toBe(0);

		const modulesBefore = await value(
			`select count(*) from organization_module where organization_id = ?`,
			[north.id],
		);
		const status = await app.expectingErrors(() =>
			page.evaluate(async ({ action, fields }) => {
				// Submitted the way a browser without JavaScript would.
				const body = new URLSearchParams(fields);
				const headers = { accept: "text/html" };
				return (await fetch(action, { method: "POST", body, headers })).status;
			}, form),
		);
		expect(status).toBe(403);
		expect(
			await value(`select count(*) from organization_module where organization_id = ?`, [north.id]),
		).toBe(modulesBefore);
	});
});
