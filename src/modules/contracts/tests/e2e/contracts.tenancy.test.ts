/**
 * Contracts for a tenant without the module (South): no sidebar entry, its pages are 404s and
 * core's pages show none of it; then with the module switched on, North's contract is a 404 and
 * a tampered form can't change it. The rest of tenant isolation (each remote function refusing
 * North's ids, customers and units, the lists and queries showing South's only, the numbers) is
 * `../unit/server/contracts.spec.ts`'s, and the module's gate `module-gate.spec.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, value, quiet } from "#e2e/app.ts";

import { activeContract, type ActiveContract, contractId, pageLocators, year } from "./helpers.ts";

const { south } = organizations;
const app = useApp();
const { sidebar, units, card } = pageLocators(app);

/** A contract and its coverage as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) =>
	rows(
		`select c.*, (select group_concat(equipment_id) from contract_equipment
		 where contract_id = c.id) as units from contract c where id = ?`,
		[id],
	);
/** The contracts, coverage and modules of both organizations, to check the file leaves them as seeded. */
const state = () =>
	rows(
		`select 'contract' as kind, organization_id, count(*) as n from contract group by 2
		 union all select 'coverage', c.organization_id, count(*) from contract_equipment ce
		 join contract c on c.id = ce.contract_id group by 2
		 union all select 'module:' || module_id, organization_id, 1 from organization_module
		 order by 1, 2`,
	);

let seeded: Awaited<ReturnType<typeof state>>;
/** A North contract that is active today, one of its units, and its customer. */
let busy: ActiveContract;
/** A South customer with at least two units. */
let southCustomer: number;

beforeAll(async () => {
	seeded = await state();
	busy = await activeContract();
	southCustomer = await value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[south.id],
	);
});

describe("in South, which doesn't have the module", () => {
	test("the sidebar lacks the module and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		expect(await sidebar()).not.toContain("Service contracts");
		expect((await app.go(`/contracts/${busy.number}`))?.status()).toBe(404);
	});

	test("orders, equipment and the dashboard show none of it", async () => {
		await app.go("/");
		expect(await card("Response times at risk").count()).toBe(0);
		expect(await card("Contracts ending soon").count()).toBe(0);
		const [order] = await rows<{ number: string; serial_number: string }>(
			`select o.number, e.serial_number from "order" o join order_unit u on u.order_id = o.id
			 join equipment e on e.id = u.equipment_id
			 where o.organization_id = ? and o.type = 'repair' order by o.id limit 1`,
			[south.id],
		);
		await app.go(`/orders/${order.number}`);
		expect(await card("Service contract").count()).toBe(0);
		const lines = card("Materials and labour");
		expect(await lines.locator("tbody tr", { hasText: "Covered by" }).count()).toBe(0);
		await app.go(`/equipment/${encodeURIComponent(order.serial_number)}`);
		expect(await card("Service contracts").count()).toBe(0);
	});
});

describe("in South, with the module enabled", () => {
	let number: string;

	test("enabling the module adds it to the sidebar, with an empty list", async () => {
		const { page } = app;
		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Enable" }).click();
		await row.getByText(/Enabled since/).waitFor();
		await app.go("/contracts");
		expect(await sidebar()).toContain("Service contracts");
		expect(await page.getByText("No contracts found").count()).toBe(1);
	});

	test("North's contracts are 404s", async () => {
		expect((await app.go(`/contracts/${busy.number}`))?.status()).toBe(404);
	});

	test("a new contract covers South's own unit", async () => {
		const { page } = app;
		await app.go("/contracts/new");
		await page.getByLabel("Customer").selectOption(String(southCustomer));
		await units().first().check();
		await page.getByLabel("Starts on").fill(`${year + 1}-01-01`);
		await page.getByLabel("Ends on").fill(`${year + 1}-12-31`);
		await page.getByLabel("Monthly fee").fill("50");
		await page.getByRole("button", { name: "Create contract" }).click();
		await page.waitForURL(/\/contracts\/CTR-/);
		await quiet(page);
		number = app.path().split("/").pop()!;
		expect(await countIn("contract", south.id)).toBe(1);
	});

	test("saving with the id of a North contract is refused", async () => {
		const { page } = app;
		const own = await contractId(number, south.id);
		const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own)];

		await app.go(`/contracts/${number}/edit`);
		await page.getByLabel("Monthly fee").fill("1");
		// Cover another unit, so the check for overlaps (which skips the contract being saved)
		// doesn't stop the request before it gets to the contract.
		await units().and(page.locator(":checked")).uncheck();
		await units().and(page.locator(":not(:checked)")).last().check();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id"]')!.value =
					String(id);
			}, busy.id);
			return app.submit(page.getByRole("button", { name: "Save contract" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/contracts/${number}/edit`);
		expect(await snapshot(busy.id)).toEqual(victimBefore);
		expect(await snapshot(own)).toEqual(ownBefore);
	});

	test("deleting South's contract and disabling the module restores the seeded state", async () => {
		const { page } = app;
		await app.go(`/contracts/${number}`);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/contracts");
		expect(await countIn("contract", south.id)).toBe(0);

		await app.go("/settings");
		const row = page.locator("div.rounded-lg.border", { hasText: "Service contracts" });
		await row.getByRole("button", { name: "Disable" }).click();
		await row.getByText("Disabled").waitFor();
		await app.go("/settings");
		expect(await sidebar()).not.toContain("Service contracts");
		expect(await state()).toEqual(seeded);
	});
});
