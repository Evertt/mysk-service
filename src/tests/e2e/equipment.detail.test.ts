/**
 * A unit's page: its timeline (what happened to it, newest first, with its orders linked) and
 * the summary's numbers; its cards packed into columns (with every module's), or
 * stacked on a phone; an unknown serial number is a 404. What the server refuses of
 * a unit with orders (deleting, moving it), what its history costs and how a completed order
 * shows in it are `equipment/server/units.spec.ts`'s and `history.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { stickiness } from "#lib/components/masonry.ts";
import { formatCents, formatDate } from "#lib/i18n/format.ts";

import { fitsWidth, onPhone, organizations, rows, useApp, value } from "./app.ts";
import { priceOf, pricedOrders } from "./contracts-helpers.ts";
import { busiest, equipmentPage } from "./equipment-helpers.ts";
import { type Box, cardBoxes, columnsOf, expectApart, packedBoxes } from "./masonry-helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, timeline } = equipmentPage(app);

/** That the order `o` is about the unit `?`, one of its units or its only one. */
const onUnit = `exists (select 1 from order_unit x where x.order_id = o.id and x.equipment_id = ?)`;

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
 * the network is quiet, and hydrating renders the timeline again.
 */
async function openUnit(unit: { id: number; serial: string }) {
	await app.go(`/equipment/${unit.serial}`);
	await app.page.locator("html[data-hydrated]").waitFor({ state: "attached" });
	await timeline().first().waitFor();
}

describe("in North", () => {
	test("the detail page shows the unit's timeline and the summary of its service", async () => {
		const { page } = app;
		const busy = await busiest(north.id);
		await openUnit(busy);

		// Its latest completed order, linked to its page (what the timeline tells of each step is
		// `equipment/server/timeline.spec.ts`'s).
		const [latest] = await rows<{ number: string }>(
			`select o.number from "order" o where ${onUnit} and o.status in ('completed', 'invoiced')
			 order by o.completed_at desc, o.id desc limit 1`,
			[busy.id],
		);
		const item = timeline().filter({ has: page.getByRole("link", { name: latest.number }) });
		await expect.poll(() => item.count()).toBeGreaterThan(0);
		expect(await item.first().innerText()).toMatch(/Order completed/);

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
	});

	test("an unknown serial number is a 404", async () => {
		expect((await app.go("/equipment/NOPE-404"))?.status()).toBe(404);
	});
});

describe("the unit's cards", () => {
	/** The unit page's cards' container (a masonry). */
	const cards = () => app.page.locator("[data-record-cards]");

	/** A North unit with few orders, so its timeline is shorter than the other cards together. */
	const quietUnit = async () => {
		const [unit] = await rows<{ serial: string }>(
			`select serial_number as serial from equipment e where organization_id = ?
			 and (select count(*) from order_unit ou where ou.equipment_id = e.id) <= 2
			 order by id limit 1`,
			[north.id],
		);
		return unit.serial;
	};

	/** Some of what the modules add to the page, each card on its own (North has every module). */
	const moduleCards = [
		"Inspections and maintenance",
		"Condition",
		"Service contracts",
		"Maintenance",
		"Parts used",
	];

	test("pack into three columns on a laptop, the timeline two wide and cards under it", async () => {
		await app.go(`/equipment/${await quietUnit()}`);
		const boxes = await packedBoxes(cards());
		const titles = boxes.map((box) => box.title);
		// In the page's order: the timeline, the unit's own cards, the modules' and the activity.
		expect(titles.slice(0, 6)).toEqual([
			"What's happening",
			"Specifications",
			"Owner",
			"Site",
			"QR code",
			"Documents",
		]);
		expect(titles.at(-1)).toBe("Activity");
		expect(titles).toEqual(expect.arrayContaining(moduleCards));
		expectApart(boxes);

		const columns = [...columnsOf(boxes)].sort((a, b) => a - b);
		expect(columns).toHaveLength(3);
		const [timeline, ...narrow] = boxes;
		const within = (box: Box) => columns.filter((left) => left >= box.left - 1 && left < box.right);
		expect(within(timeline)).toEqual(columns.slice(0, 2));
		for (const box of narrow) expect(within(box), box.title).toHaveLength(1);

		// Cards fill the space under the timeline, so the columns end about together: no further
		// apart than the tallest card (with the gap and the masonry's `stickiness`).
		expect(narrow.some((box) => box.top >= timeline.bottom && box.left < timeline.right)).toBe(
			true,
		);
		const bottoms = columns.map((left) =>
			Math.max(...boxes.filter((box) => within(box).includes(left)).map((box) => box.bottom)),
		);
		const tallest = Math.max(...narrow.map((box) => box.bottom - box.top));
		expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(
			tallest + 24 + stickiness,
		);
	});

	test("stack in the page's order on a phone, without scrolling sideways", async () => {
		const serial = await quietUnit();
		await onPhone(app.page, async () => {
			await app.go(`/equipment/${serial}`);
			expect(await app.page.locator("[data-record-cards][data-masonry]").count()).toBe(0);
			const boxes = await cardBoxes(cards());
			expect(boxes[0].title).toBe("What's happening");
			expect(boxes.at(-1)?.title).toBe("Activity");
			expect(columnsOf(boxes).size).toBe(1);
			for (const [index, box] of boxes.slice(1).entries()) {
				expect(box.top, box.title).toBeGreaterThanOrEqual(boxes[index].bottom);
			}
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});
});
