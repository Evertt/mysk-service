import { describe, expect, test } from "vite-plus/test";

import { formatCents, formatDate } from "#lib/i18n/format.ts";

import { cents, organizations, rows, useApp, value } from "./app.ts";
import { covered, priceOf, pricedOrders } from "./contracts-helpers.ts";
import { busiest, customersIn, equipmentPage, unit, unitId } from "./equipment-helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, customerOptions, shownTimeline, timeline } = equipmentPage(app);

/**
 * What a unit's timeline should show, newest first: each order when it was completed, else
 * scheduled, else created; on the same day, the warranty's end above orders and the installation
 * below them.
 */
async function expectedTimeline(id: number) {
	const [unit] = await rows<{ installed: number; warranty: number }>(
		`select installed_at as installed, warranty_until as warranty from equipment where id = ?`,
		[id],
	);
	const orders = await rows<{ number: string; at: number }>(
		`select number, coalesce(completed_at, scheduled_for, created_at) as at from "order"
		 where equipment_id = ? order by at desc, id desc`,
		[id],
	);
	return [
		{ label: "warranty", at: unit.warranty, rank: 0 },
		...orders.map((order) => ({ label: order.number, at: order.at, rank: 1 })),
		{ label: "installation", at: unit.installed, rank: 2 },
	]
		.sort((a, b) => b.at - a.at || a.rank - b.rank)
		.map((event) => event.label);
}

/** Calendar days from one date to another. */
const daysBetween = (from: Date, to: Date) => {
	const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return Math.round((day(to).getTime() - day(from).getTime()) / (24 * 60 * 60 * 1000));
};

/**
 * What the unit's summary should show; cost and repairs count its done (completed or invoiced)
 * orders, the cost less what contracts include, like the orders' own pages.
 */
async function expectedStats(id: number) {
	const done = `o.equipment_id = ? and o.status in ('completed', 'invoiced')`;
	const cost = (await pricedOrders(north.id, done, [id])).reduce(
		(sum, order) => sum + priceOf(order).total,
		0,
	);
	const lastService = await value<number | null>(
		`select max(completed_at) from "order" o where ${done}`,
		[id],
	);
	const repairs = (
		await rows<{ at: number }>(
			`select completed_at as at from "order" o where ${done} and o.type = 'repair'
			 order by completed_at`,
			[id],
		)
	).map((row) => new Date(row.at * 1000));
	const byType = await rows<{ type: string; n: number }>(
		`select type, count(*) as n from "order" where equipment_id = ? group by type`,
		[id],
	);
	const now = new Date();
	return {
		orders: byType.reduce((sum, row) => sum + row.n, 0),
		byType: Object.fromEntries(byType.map((row) => [row.type, row.n])),
		cost: formatCents(cost),
		lastService: lastService ? formatDate(new Date(lastService * 1000)) : "Never",
		sinceRepair: repairs.length ? `${daysBetween(repairs.at(-1)!, now)} day` : null,
		betweenRepairs:
			repairs.length >= 2
				? Math.round(daysBetween(repairs[0], repairs.at(-1)!) / (repairs.length - 1))
				: null,
	};
}

describe("in North", () => {
	test("the detail page shows the unit's service history, newest first", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await app.go(`/equipment/${busy.serial}`);
		expect(await shownTimeline()).toEqual(await expectedTimeline(busy.id));

		// An order shows its engineer, its materials and what it cost.
		const [latest] = await rows<{ id: number; number: string; engineer: string | null }>(
			`select o.id, o.number, g.name as engineer from "order" o
			 left join engineer g on g.id = o.engineer_id
			 where o.equipment_id = ? and o.status in ('completed', 'invoiced')
			 and exists (select 1 from order_line l where l.order_id = o.id)
			 order by o.completed_at desc limit 1`,
			[busy.id],
		);
		const item = timeline().filter({ has: page.getByRole("link", { name: latest.number }) });
		const shown = await item.innerText();
		expect(shown).toContain(latest.engineer ?? "Unassigned");
		const materials = await rows<{ sku: string }>(
			`select m.sku from order_line l join material m on m.id = l.material_id where l.order_id = ?`,
			[latest.id],
		);
		expect(materials.length).toBeGreaterThan(0);
		for (const { sku } of materials) expect(shown).toContain(sku);
		expect(await item.locator('a[href^="/materials/"]').count()).toBe(materials.length);

		// Every order costs what it does on its own page: less what a contract includes, which shows.
		// On the busiest unit with an order that a contract includes something of.
		const [covering] = await rows<{ id: number; serial: string }>(
			`with ${covered} select e.id, e.serial_number as serial from equipment e
			 join "order" o on o.equipment_id = e.id join covered c on c.order_id = o.id and c.n = 1
			 where e.organization_id = ? and c.level in ('standard', 'premium') and o.labor_hours > 0
			 group by e.id order by (select count(*) from "order" x where x.equipment_id = e.id) desc, e.id
			 limit 1`,
			[north.id],
		);
		if (covering.id !== busy.id) await app.go(`/equipment/${covering.serial}`);
		const priced = await pricedOrders(north.id, `o.equipment_id = ?`, [covering.id]);
		expect(priced.some((order) => priceOf(order).included > 0)).toBe(true);
		for (const order of priced) {
			const entry = timeline().filter({ has: page.getByRole("link", { name: order.number }) });
			const { total, included } = priceOf(order);
			expect(cents(await entry.locator('[data-cost="total"]').innerText())).toBe(total);
			const adjustments = entry.locator('[data-cost="adjustment"]');
			if (included) {
				expect(cents(await adjustments.innerText())).toBe(-included);
				expect(await entry.innerText()).toContain(`Covered by ${order.contract}`);
			} else expect(await adjustments.count()).toBe(0);
		}
	});

	test("the summary counts its orders by type, their cost and the time between repairs", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await app.go(`/equipment/${busy.serial}`);
		const expected = await expectedStats(busy.id);
		expect(expected.betweenRepairs).not.toBeNull();

		expect(await card("Orders")).toMatch(new RegExp(`^Orders ${expected.orders} `));
		const byType = (await page.getByRole("list", { name: "Orders by type" }).innerText()).replace(
			/\s+/g,
			" ",
		);
		for (const [type, label] of [
			["installation", "Installation"],
			["maintenance", "Maintenance"],
			["repair", "Repair"],
			["inspection", "Inspection"],
		]) {
			expect(byType).toContain(`${label} ${expected.byType[type] ?? 0}`);
		}
		expect(await card("Service cost")).toContain(expected.cost);
		expect(await card("Last service")).toContain(expected.lastService);
		const repairs = await card("Since last repair");
		expect(repairs).toContain(expected.sinceRepair!);
		expect(repairs).toContain(`Mean time between repairs: ${expected.betweenRepairs} day`);
	});

	test("deleting a unit with orders is refused", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await dialog.locator('[data-slot="field-error"]').innerText()).toContain(
			`${busy.orders} orders refer to it`,
		);
		expect(app.path()).toBe(`/equipment/${busy.serial}`);
		expect(await unitId(busy.serial, north.id)).toBe(busy.id);
		await page.keyboard.press("Escape");
	});

	test("moving a unit with orders to another customer is refused", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		const [before] = await unit(busy.id);
		await app.go(`/equipment/${busy.serial}/edit`);
		const inNorth = await customersIn(north.id);
		await expect.poll(customerOptions).toEqual(inNorth);

		await page
			.getByLabel("Customer")
			.selectOption(inNorth.find((id) => id !== String(before.customer_id))!);
		await app.submit(page.getByRole("button", { name: "Save equipment" }));
		expect(await app.issues()).toContainEqual(expect.stringContaining("Can't move this unit"));
		expect(app.path()).toBe(`/equipment/${busy.serial}/edit`);
		expect(await unit(busy.id)).toEqual([before]);
	});

	test("completing an order shows in the unit's history and summary", async () => {
		const { page } = app;
		const [open] = await rows<{ number: string; serial: string; unit: number }>(
			`select o.number, e.serial_number as serial, e.id as unit from "order" o
			 join equipment e on e.id = o.equipment_id where o.organization_id = ?
			 and o.type = 'repair' and o.status in ('scheduled', 'in_progress') order by o.id limit 1`,
			[north.id],
		);
		const item = () => timeline().filter({ has: page.getByRole("link", { name: open.number }) });
		await app.go(`/equipment/${open.serial}`);
		expect(await item().locator('[data-slot="badge"]').innerText()).not.toContain("Completed");

		await app.go(`/orders/${open.number}/edit`);
		await page.getByLabel("Status").selectOption("completed");
		await page.getByRole("button", { name: "Save order" }).click();
		await page.waitForURL((url) => url.pathname === `/orders/${open.number}`);
		expect(
			await value(`select status from "order" where number = ? and organization_id = ?`, [
				open.number,
				north.id,
			]),
		).toBe("completed");

		await app.go(`/equipment/${open.serial}`);
		expect(await shownTimeline()).toEqual(await expectedTimeline(open.unit));
		const today = formatDate(new Date());
		expect(await item().locator('[data-slot="badge"]').innerText()).toContain("Completed");
		expect(await item().locator("time").innerText()).toBe(today);
		expect(await card("Last service")).toContain(today);
		expect(await card("Since last repair")).toContain("0 days");
		expect(await card("Service cost")).toContain((await expectedStats(open.unit)).cost);
	});

	test("an unknown serial number is a 404", async () => {
		expect((await app.go("/equipment/NOPE-404"))?.status()).toBe(404);
	});
});
