/**
 * The materials list's queries on the seeded demo database, as a link to the list (or its table)
 * asks for them: found by SKU and by name, filtered by unit, stock level and ranges (combined with
 * each other and the other filters, prices in euros), sorted by stock level and by usage, the
 * dashboard's count of the low and out of stock ones, and South seeing its own materials only.
 * The server side of `materials.test.ts` and `materials.ranges.test.ts`, which keep the pages.
 */
import { describe, expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { getStockLevels } from "#modules/materials/dashboard/stock-levels.remote.ts";
import { getMaterialFacets, getMaterials } from "#modules/materials/list/material-list.remote.ts";
import { materialsList } from "#modules/materials/list/materials-list.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

/** The query a link to the list with `search` makes, as the table builds it. */
const queryOf = (search: string) =>
	toListQuery(materialsList, parseTableUrl(new URLSearchParams(search), materialsList.urlSpec));

/** The first page of the list a link with `search` opens, as `actor` (North's planner). */
const opened = (search: string, actor: Actor = north.member) =>
	as(actor, () => data(getMaterials, queryOf(search)));

/** How many materials a link with `search` lists. */
const shownFor = async (search: string) => (await opened(search)).rowCount;

/** The names on the first page a link with `search` opens. */
const namesFor = async (search: string) => (await opened(search)).rows.map((row) => row.name);

/** How many of an organization's materials `m` match `where`. */
const count = async (where: string, organization = northId) =>
	Number(
		await value(`select count(*) from material m where organization_id = ? and ${where}`, [
			organization,
		]),
	);

/** The orders a material is used on, in SQL. */
const usedOn = `(select count(distinct l.order_id) from order_line l where l.material_id = m.id)`;

/** A material runs low below 10 pieces or 50 of anything else (`stockLevel()`). */
const low = `stock < case unit when 'pcs' then 10 else 50 end`;

describe("North's materials list", () => {
	test("lists them all by name, 50 to a page", async () => {
		const all = await opened("");
		expect(all.rowCount).toBe(await count("1"));
		const names = all.rows.map((row) => row.name);
		expect(names).toHaveLength(Math.min(50, all.rowCount));
		const expected = await rows<{ name: string }>(
			`select name from material where organization_id = ? order by name collate nocase, id limit 50`,
			[northId],
		);
		expect(names).toEqual(expected.map((row) => row.name));
	});

	test("shows each one's price and the number of orders it's used on", async () => {
		const [first] = (await opened("q=MAT-0001")).rows;
		const [stored] = await rows<{ name: string; unit_price: number; orders: number }>(
			`select name, unit_price, ${usedOn} as orders from material m
			 where organization_id = ? and sku = 'MAT-0001'`,
			[northId],
		);
		expect(first).toMatchObject({
			name: stored.name,
			unitPrice: stored.unit_price,
			orderCount: stored.orders,
		});
	});

	test("finds them by SKU and by name", async () => {
		const third = await value<string>(
			`select name from material where organization_id = ? and sku = 'MAT-0003'`,
			[northId],
		);
		expect(await namesFor("q=MAT-0003")).toEqual([third]);
		const refrigerants = await rows<{ name: string }>(
			`select name from material where organization_id = ? and name like '%koudemiddel%'`,
			[northId],
		);
		expect(refrigerants.length).toBeGreaterThan(0);
		expect((await namesFor("q=koudemiddel")).toSorted()).toEqual(
			refrigerants.map((row) => row.name).toSorted(),
		);
	});

	test("filters by unit, and by stock level", async () => {
		const litres = await count("unit = 'l'");
		expect(litres).toBeGreaterThan(0);
		const inLitres = await opened("unit=l");
		expect(inLitres.rowCount).toBe(litres);
		for (const row of inLitres.rows) expect(row.unit).toBe("l");

		const lowOrOut = await count(low);
		expect(lowOrOut).toBeGreaterThan(0);
		expect(await shownFor("stock=out,low")).toBe(lowOrOut);
		expect(await shownFor("stock=out")).toBe(await count("stock <= 0"));
	});

	test("counts each unit and stock level in its filters, narrowed by the other filters", async () => {
		const facets = await as(north.member, () => {
			const { q, filters } = queryOf("unit=pcs");
			return data(getMaterialFacets, { q, filters });
		});
		const units = await rows<{ unit: string; n: number }>(
			`select unit, count(*) as n from material where organization_id = ? group by unit`,
			[northId],
		);
		expect(facets.unit).toEqual(Object.fromEntries(units.map((row) => [row.unit, row.n])));
		const pieces = (where: string) => count(`unit = 'pcs' and ${where}`);
		expect(facets.stockLevel).toMatchObject({
			low: await pieces(`stock > 0 and ${low}`),
			in_stock: await pieces(`not (${low})`),
		});
	});

	test("sorts by stock level: out, low, then in stock, each by name", async () => {
		const expected = await rows<{ name: string }>(
			`select name from material where organization_id = ?
			 order by case when stock <= 0 then 0 when ${low} then 1 else 2 end, name collate nocase, id`,
			[northId],
		);
		expect(await namesFor("sort=stock,name")).toEqual(expected.slice(0, 50).map((r) => r.name));
	});

	test("sorts by usage, the busiest first", async () => {
		const [busiest] = (await opened("sort=-used")).rows;
		const most = await value<number>(
			`select max(${usedOn}) from material m where organization_id = ?`,
			[northId],
		);
		expect(busiest.orderCount).toBe(most);
	});

	test("combines ranges with each other and the other filters, prices in euros", async () => {
		expect(await shownFor("used=1..&quantity=50..")).toBe(
			await count(`${usedOn} >= 1 and stock >= 50`),
		);
		expect(await shownFor("used=0&unit=pcs")).toBe(await count(`${usedOn} = 0 and unit = 'pcs'`));
		expect(await shownFor("price=..10")).toBe(await count("unit_price <= 1000"));
		expect(await shownFor("price=10.01..")).toBe(await count("unit_price >= 1001"));
		expect(await shownFor("quantity=..10")).toBe(await count("stock <= 10"));
		// Several values: either.
		expect(await shownFor("quantity=0,50..60")).toBe(
			await count("(stock = 0 or stock between 50 and 60)"),
		);
		// What isn't a range is ignored.
		expect(await shownFor("quantity=10..5&used=lots")).toBe(await count("1"));
	});
});

describe("the dashboard", () => {
	test("counts the materials that run low and those that are out", async () => {
		expect(await as(north.member, () => data(getStockLevels))).toEqual({
			low: await count(`stock > 0 and ${low}`),
			out: await count("stock <= 0"),
			total: await count("1"),
		});
	});
});

describe("South's materials list", () => {
	test("shows South's materials only, in its counts too", async () => {
		const all = await opened("", south.owner);
		expect(all.rowCount).toBe(await count("1", southId));
		const own = new Set(
			(
				await rows<{ id: number }>(`select id from material where organization_id = ?`, [southId])
			).map((row) => row.id),
		);
		for (const row of all.rows) expect(own.has(row.id)).toBe(true);
		// A SKU both have is South's own, with South's usage.
		const [first] = (await opened("q=MAT-0001", south.owner)).rows;
		const [stored] = await rows<{ id: number; orders: number }>(
			`select id, ${usedOn} as orders from material m where organization_id = ? and sku = 'MAT-0001'`,
			[southId],
		);
		expect(first).toMatchObject({ id: stored.id, orderCount: stored.orders });
		expect(await as(south.owner, () => data(getStockLevels))).toMatchObject({
			total: await count("1", southId),
		});
	});
});
