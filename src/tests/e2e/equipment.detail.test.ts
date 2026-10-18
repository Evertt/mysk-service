/**
 * A unit's page: its service history newest first, with each order's engineer, materials and
 * cost, and the summary's numbers; an unknown serial number is a 404. What the server refuses of
 * a unit with orders (deleting, moving it), what its history costs and how a completed order
 * shows in it are `equipment/server/units.spec.ts`'s and `history.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { formatCents, formatDate } from "#lib/i18n/format.ts";

import { cents, organizations, rows, useApp, value } from "./app.ts";
import { covered, priceOf, pricedOrders } from "./contracts-helpers.ts";
import { busiest, equipmentPage } from "./equipment-helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, shownTimeline, timeline } = equipmentPage(app);

/** That the order `o` is about the unit `?`, one of its units or its only one. */
const onUnit = `exists (select 1 from order_unit x where x.order_id = o.id and x.equipment_id = ?)`;

/**
 * What a unit's timeline should show, newest first: each order when it was completed, else
 * scheduled, else created; on the same day, the warranty's end above orders and the installation
 * below them.
 */
async function expectedTimeline(id: number) {
	const [unit] = await rows<{ installed: string; warranty: string }>(
		`select installed_at as installed, warranty_until as warranty from equipment where id = ?`,
		[id],
	);
	// An order's day in the machine's time zone (the test server's), and its moment that day.
	const orders = await rows<{ number: string; day: string; at: number }>(
		`select number, date(coalesce(completed_at, scheduled_for, created_at), 'unixepoch',
		 'localtime') as day, coalesce(completed_at, scheduled_for, created_at) as at from "order" o
		 where ${onUnit} order by at desc, id desc`,
		[id],
	);
	return [
		{ label: "warranty", day: unit.warranty, rank: 0, at: 0 },
		...orders.map((order) => ({ label: order.number, day: order.day, rank: 1, at: order.at })),
		{ label: "installation", day: unit.installed, rank: 2, at: 0 },
	]
		.sort((a, b) => b.day.localeCompare(a.day) || a.rank - b.rank || b.at - a.at)
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
	const done = `${onUnit} and o.status in ('completed', 'invoiced')`;
	const cost = (await pricedOrders(north.id, done, [id])).reduce(
		(sum, order) => sum + Math.round(priceOf(order).total / order.units),
		0,
	);
	const lastService = await value<number | null>(
		`select max(completed_at) from "order" o where ${done}`,
		[id],
	);
	const repairs = (
		await rows<{ at: number }>(
			`select completed_at as at from "order" o where ${done}
			 and o.type in ('breakdown', 'repair')
			 order by completed_at`,
			[id],
		)
	).map((row) => new Date(row.at * 1000));
	const byType = await rows<{ type: string; n: number }>(
		`select type, count(*) as n from "order" o where ${onUnit} group by type`,
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

/**
 * Opens a unit's page once it's hydrated and shows its timeline: `go()` may be back before, once
 * the network is quiet, and hydrating renders the timeline again, its orders' links gone for a
 * moment (seen with the CPU 20 times slower).
 */
async function openUnit(unit: { id: number; serial: string }) {
	await app.go(`/equipment/${unit.serial}`);
	await app.page.locator("html[data-hydrated]").waitFor({ state: "attached" });
	const events = await expectedTimeline(unit.id);
	await expect.poll(shownTimeline).toEqual(events);
}

describe("in North", () => {
	test("the detail page shows the unit's service history, newest first", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await openUnit(busy);

		// An order shows its engineer, its materials and what it cost.
		const [latest] = await rows<{ id: number; number: string; engineer: string | null }>(
			`select o.id, o.number, g.name as engineer from "order" o
			 left join engineer g on g.id = o.engineer_id
			 where ${onUnit} and o.status in ('completed', 'invoiced')
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

		// The summary shows its numbers (`service-history.spec.ts` counts them): its orders by type,
		// their cost and the time between repairs.
		const expected = await expectedStats(busy.id);
		expect(expected.betweenRepairs).not.toBeNull();
		expect(await card("Orders")).toMatch(new RegExp(`^Orders ${expected.orders} `));
		const byType = (await page.getByRole("list", { name: "Orders by type" }).innerText()).replace(
			/\s+/g,
			" ",
		);
		// The types it has orders of, in the order they're picked in.
		const labels: Record<string, string> = {
			breakdown: "Breakdown",
			repair: "Repair",
			maintenance: "Maintenance",
			inspection: "Inspection",
			installation: "Installation",
			survey: "Survey",
			damage: "Damage",
			project: "Project",
			other: "Other",
		};
		expect(byType.trim()).toBe(
			Object.keys(labels)
				.filter((type) => expected.byType[type])
				.map((type) => `${labels[type]} ${expected.byType[type]}`)
				.join(" "),
		);
		expect(await card("Service cost")).toContain(expected.cost);
		expect(await card("Last service")).toContain(expected.lastService);
		const repairs = await card("Since last repair");
		expect(repairs).toContain(expected.sinceRepair!);
		expect(repairs).toContain(`Mean time between repairs: ${expected.betweenRepairs} day`);

		// What a contract includes shows on the order, less (what each order costs, as on its own
		// page, is `equipment/server/history.spec.ts`'s). On the busiest unit with an order that a
		// contract includes something of.
		const [covering] = await rows<{ id: number; serial: string }>(
			`with ${covered} select e.id, e.serial_number as serial from equipment e
			 join order_unit ou on ou.equipment_id = e.id join "order" o on o.id = ou.order_id
			 join covered c on c.order_id = o.id and c.n = 1
			 where e.organization_id = ? and c.level in ('standard', 'premium') and o.labor_hours > 0
			 group by e.id order by (select count(*) from order_unit x where x.equipment_id = e.id) desc, e.id
			 limit 1`,
			[north.id],
		);
		if (covering.id !== busy.id) await openUnit(covering);
		const [order] = (await pricedOrders(north.id, onUnit, [covering.id])).filter(
			(each) => priceOf(each).included > 0,
		);
		const entry = timeline().filter({ has: page.getByRole("link", { name: order.number }) });
		expect(cents(await entry.locator('[data-cost="adjustment"]').innerText())).toBe(
			-priceOf(order).included,
		);
		expect(await entry.innerText()).toContain(`Covered by ${order.contract}`);
	});

	test("an unknown serial number is a 404", async () => {
		expect((await app.go("/equipment/NOPE-404"))?.status()).toBe(404);
	});
});
