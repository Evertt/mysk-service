/**
 * Who may read and change the materials module's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads the materials and every order's lines; an engineer
 * the materials to pick from and the lines on their own orders (an order's line is logged under
 * its material's id); a customer's contact neither; and none of it exists for a tenant without the
 * module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import {
	as,
	demoAccount,
	north,
	rows,
	shltr,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");

/** The materials with a line on some order, the ids an `order_line` subject carries. */
const usedMaterials = async (organization: string, where = "", args: (string | number)[] = []) =>
	(
		await rows<{ material_id: number }>(
			`select distinct material_id from order_line where organization_id = ? ${where} order by material_id`,
			[organization, ...args],
		)
	).map((row) => String(row.material_id));

describe("the office", () => {
	test("reads its tenant's materials and order lines, and not another's", async () => {
		const materials = (await idsOf("material", "org-shltr")).slice(0, 12);
		const used = await usedMaterials("org-shltr");
		expect(materials.length).toBeGreaterThan(0);
		expect(used.length).toBeGreaterThan(0);
		expect(await readOneByOne(shltr.member, "material", materials)).toEqual(materials);
		expect(await readOneByOne(shltr.member, "order_line", used)).toEqual(used);
		expect(await readOneByOne(north.owner, "material", materials)).toEqual([]);
		expect(await readOneByOne(north.owner, "order_line", used)).toEqual([]);
	});

	test("finds none of them in a tenant without the module", async () => {
		const [material] = await idsOf("material", "org-shltr");
		await withoutModule("shltr", "materials", async () => {
			await as(shltr.owner, async () => {
				expect(await mayRead({ type: "material", id: material })).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			expect(await mayRead({ type: "material", id: material })).toBe(true);
		});
	});
});

describe("a field engineer", () => {
	test("reads every material, and the lines on their own orders only", async () => {
		await as(shltr.engineer, () => null);
		const me = await value<number>(
			`select e.id from engineer e join "user" u on u.id = e.user_id where u.email = ?`,
			[shltr.engineer.email],
		);
		// A material that only another engineer's order uses.
		await rows(
			`insert into material (organization_id, sku, name, unit, unit_price, stock)
			 values ('org-shltr', 'ACCESS-1', 'Access test', 'piece', 100, 5)`,
		);
		const [other] = await rows<{ id: number }>(
			`select id from "order" where organization_id = 'org-shltr' and engineer_id != ? order by id limit 1`,
			[me],
		);
		await rows(
			`insert into order_line (organization_id, order_id, material_id, quantity, unit_price)
			 values ('org-shltr', ?, (select id from material where sku = 'ACCESS-1'), 1, 100)`,
			[other.id],
		);
		const materials = await idsOf("material", "org-shltr");
		expect(await readOneByOne(shltr.engineer, "material", materials)).toEqual(materials);
		const all = await usedMaterials("org-shltr");
		const mine = await usedMaterials(
			"org-shltr",
			`and order_id in (select id from "order" where engineer_id = ?)`,
			[me],
		);
		expect(mine.length).toBeGreaterThan(0);
		// A material used by someone else's orders only is none of theirs.
		const notMine = all.filter((id) => !mine.includes(id));
		expect(notMine.length).toBeGreaterThan(0);
		expect(await readOneByOne(shltr.engineer, "order_line", all)).toEqual(mine);
		await as(shltr.engineer, async () => {
			expect(await mayChange({ type: "order_line", id: mine[0] })).toBe(true);
			expect(await mayChange({ type: "material", id: materials[0] })).toBe(false);
		});
	});
});

describe("a customer's contact", () => {
	test("reads no materials, no order lines", async () => {
		const materials = await idsOf("material", "org-shltr");
		const used = await usedMaterials("org-shltr");
		expect(await readOneByOne(riedel, "material", materials)).toEqual([]);
		expect(await readOneByOne(riedel, "order_line", used)).toEqual([]);
	});
});
