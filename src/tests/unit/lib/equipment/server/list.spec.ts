/**
 * The equipment list's queries on the seeded demo database, as a link to the list or its table
 * asks for them: the facets that count each category (narrowed by the other filters) in the
 * tenant's order, the open orders (sorted, and as a range), the dates' ranges combined with the
 * other filters, finding units by their own name and their location, and South seeing its own
 * units only, also by a North customer's code, in its facets and its groups. The server side of
 * `src/tests/e2e/equipment.list.test.ts`, `equipment.tenancy.test.ts`,
 * `equipment.locations.test.ts` and `equipment.categories.test.ts`, which keep the pages.
 */
import { describe, expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { presetRange } from "#lib/components/data-table/ranges.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { getEquipmentCategories } from "#lib/equipment/categories/categories.remote.ts";
import { getEquipmentFormOptions } from "#lib/equipment/equipment.remote.ts";
import { getEquipmentFacets, getEquipmentList } from "#lib/equipment/list/equipment-list.remote.ts";
import { equipmentList } from "#lib/equipment/list/equipment-list.ts";
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

/** The query a link to the list with `search` makes, as `actor`'s table builds it. */
const queryOf = (search: string) =>
	toListQuery(equipmentList, parseTableUrl(new URLSearchParams(search), equipmentList.urlSpec));

/** The first page of the list a link with `search` opens, as `actor` (North's planner). */
const opened = (search: string, actor: Actor = north.member) =>
	as(actor, () => data(getEquipmentList, queryOf(search)));

/** How many units a link with `search` lists. */
const shownFor = async (search: string, actor?: Actor) => (await opened(search, actor)).rowCount;

/** The facets of the list a link with `search` opens. */
const facetsFor = (search: string, actor: Actor = north.member) =>
	as(actor, () => {
		const { q, filters } = queryOf(search);
		return data(getEquipmentFacets, { q, filters });
	});

/** How many of an organization's units `e` match `where`. */
const count = async (where: string, args: (number | string)[] = [], organization = northId) =>
	Number(
		await value(`select count(*) from equipment e where organization_id = ? and ${where}`, [
			organization,
			...args,
		]),
	);

/** A unit's open orders, in SQL. */
const openOrders = `(select count(*) from "order" o join order_unit ou on ou.order_id = o.id
	where ou.equipment_id = e.id and o.status in ('quote', 'scheduled', 'in_progress'))`;

/** Today, as the database has days: `yyyy-mm-dd`, in the seed's (and the visitors') time zone. */
const today = () => Temporal.Now.plainDateISO("Europe/Amsterdam");

/** An organization's categories in its order, with how many units each has (`status` only). */
const categoriesOf = (organization: string, status?: string) =>
	rows<{ id: number; name: string; units: number }>(
		`select c.id, c.name, count(e.id) as units from equipment_category c
		 left join equipment e on e.category_id = c.id ${status ? "and e.status = ?" : ""}
		 where c.organization_id = ? group by c.id order by c.position, c.id`,
		status ? [status, organization] : [organization],
	);

describe("North's equipment list", () => {
	test("counts each category's units, narrowed by the other filters", async () => {
		const all = await facetsFor("");
		const categories = await categoriesOf(northId);
		expect(all.category).toEqual(
			Object.fromEntries(categories.filter((c) => c.units).map((c) => [c.id, c.units])),
		);
		const operational = await categoriesOf(northId, "operational");
		expect((await facetsFor("status=operational")).category).toEqual(
			Object.fromEntries(operational.filter((c) => c.units).map((c) => [c.id, c.units])),
		);
	});

	test("the form and the filter have the categories in the tenant's order", async () => {
		const names = (await categoriesOf(northId)).map((category) => category.name);
		await as(north.member, async () => {
			expect((await data(getEquipmentFormOptions)).categories.map((c) => c.name)).toEqual(names);
			expect((await data(getEquipmentCategories)).map((c) => c.name)).toEqual(names);
		});
	});

	test("sorts by open orders, the busiest first", async () => {
		const [{ most }] = await rows<{ most: number }>(
			`select max(${openOrders}) as most from equipment e where organization_id = ?`,
			[northId],
		);
		expect(most).toBeGreaterThan(0);
		const { rows: found } = await opened("sort=-open-orders");
		expect(found[0].openOrders).toBe(most);
		const shown = found.map((row) => row.openOrders);
		expect(shown).toEqual(shown.toSorted((a, b) => b - a));
	});

	test("filters by the open orders and the dates' ranges, combined with the other filters", async () => {
		expect(await shownFor("open-orders=1..")).toBe(await count(`${openOrders} >= 1`));
		expect(await shownFor("warranty=before-today")).toBe(
			await count("warranty_until < ?", [today().toString()]),
		);
		const lastYear = presetRange("last-year", today()).from!;
		expect(await shownFor(`installed=${lastYear}..&open-orders=..0`)).toBe(
			await count(`installed_at >= ? and ${openOrders} <= 0`, [lastYear]),
		);
		const thisYear = presetRange("this-year", today());
		const chiller = await value<number>(
			`select id from equipment_category where organization_id = ? and name = 'Koelmachine'`,
			[northId],
		);
		expect(await shownFor(`warranty=this-year&category=${chiller}`)).toBe(
			await count("warranty_until between ? and ? and category_id = ?", [
				thisYear.from!,
				thisYear.to!,
				chiller,
			]),
		);
		// What isn't a range is left out of the query.
		expect(await shownFor("open-orders=some&installed=2026-02-30")).toBe(await count("1"));
	});

	test("finds units by their own name, and by their location's, and filters by the location", async () => {
		// A unit with a name of its own (the seed's have none).
		const named = {
			serial: await value<string>(
				`select serial_number from equipment where organization_id = ? order by id desc limit 1`,
				[northId],
			),
			name: "Automatische deur kantine BES-3",
		};
		await rows(`update equipment set name = ? where serial_number = ? and organization_id = ?`, [
			named.name,
			named.serial,
			northId,
		]);
		const byName = await opened(`q=${encodeURIComponent(named.name)}`);
		expect(byName.rows.map((row) => row.serialNumber)).toContain(named.serial);

		const [location] = await rows<{ id: number; name: string; units: number }>(
			`select l.id, l.name, count(e.id) as units from equipment_location l
			 join equipment e on e.location_id = l.id where l.organization_id = ?
			 group by l.id order by units desc, l.id limit 1`,
			[northId],
		);
		const atLocation = await opened(`location=${location.id}`);
		expect(atLocation.rowCount).toBe(location.units);
		expect(new Set(atLocation.rows.map((row) => row.location?.id))).toEqual(new Set([location.id]));
		const found = await opened(`q=${encodeURIComponent(location.name)}&location=${location.id}`);
		expect(found.rowCount).toBe(location.units);
		expect(found.rows[0].location?.name).toBe(location.name);
	});
});

describe("South's equipment list", () => {
	test("never shows North's units, whatever its filters say", async () => {
		const northCode = await value<string>(
			`select code from customer where organization_id = ?
			 and code not in (select code from customer where organization_id = ?) order by code limit 1`,
			[northId, southId],
		);
		expect(await shownFor(`customer=${northCode}`, south.owner)).toBe(0);
		expect(await shownFor("", south.owner)).toBe(await count("1", [], southId));
	});

	test("its facets count South's units in South's categories only", async () => {
		const categories = await categoriesOf(southId);
		const { category } = await facetsFor("", south.owner);
		expect(category).toEqual(
			Object.fromEntries(categories.filter((c) => c.units).map((c) => [c.id, c.units])),
		);
		expect(Object.values(category).reduce((sum, n) => sum + n, 0)).toBe(
			await count("1", [], southId),
		);
		const names = await as(south.owner, async () =>
			(await data(getEquipmentFormOptions)).categories.map((c) => c.name),
		);
		expect(names).toEqual(categories.map((c) => c.name));
	});

	test("grouped by category, each group counts South's units only", async () => {
		const expected = await rows<{ category: number; n: number }>(
			`select e.category_id as category, count(*) as n from equipment e
			 join equipment_category c on c.id = e.category_id
			 where e.organization_id = ? group by e.category_id order by c.position, c.id`,
			[southId],
		);
		const counts: Record<string, number> = {};
		// Page by page, as the table loads them, till every group has been seen.
		const query = queryOf("group=category");
		for (let pageIndex = 0; ; pageIndex++) {
			const { groups, rows: found } = await as(south.owner, () =>
				data(getEquipmentList, { ...query, pageIndex }),
			);
			Object.assign(counts, groups?.counts);
			if (found.length < query.pageSize) break;
		}
		expect(counts).toEqual(Object.fromEntries(expected.map((row) => [row.category, row.n])));
	});

	test("its ranges count South's units only", async () => {
		expect(await shownFor("warranty=before-today", south.owner)).toBe(
			await count("warranty_until < ?", [today().toString()], southId),
		);
		expect(await shownFor("open-orders=1..", south.owner)).toBe(
			await count(`${openOrders} >= 1`, [], southId),
		);
	});
});
