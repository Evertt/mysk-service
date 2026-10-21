/**
 * Who may read and change the partner programme's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads them all and managers change them (any member the
 * classifications); a partner's contact reads their customer's partnership, closed years and wallet
 * and this year's rules, and makes their own bonus choice while a closed year has none; a customer
 * that isn't a partner reads nothing; and none of it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { readOneByOne } from "#unit/lib/server/access/support.ts";
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
const weggemans = demoAccount("rob@weggemans.example");
const pakhuis = demoAccount("inkoop@pakhuis7.example");

/** Each type, its table, and the column its subject id is. */
const types = [
	["partner", "partner_account", "customer_id"],
	["partner_programme_year", "partner_programme_year", "id"],
	["partner_classification", "partner_order_classification", "order_id"],
	["partner_bonus_year", "partner_bonus_year", "id"],
	["partner_wallet_entry", "partner_wallet_entry", "id"],
] as const;

/** The ids of `table`'s records in `organization`, by `column`, as text. */
const ids = async (
	table: string,
	column: string,
	where = "",
	args: (string | number)[] = [],
	organization = "org-shltr",
) =>
	(
		await rows<{ id: number | string }>(
			`select ${column} as id from "${table}" where organization_id = ? ${where} order by 1`,
			[organization, ...args],
		)
	).map((row) => String(row.id));

const customerOf = (actor: { email: string }) =>
	value<number>(
		`select c.customer_id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
		[actor.email],
	);

describe("the office", () => {
	test("reads the records of its tenant, and another tenant's office none", async () => {
		for (const [type, table, column] of types) {
			const own = await ids(table, column);
			expect(own.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(shltr.member, type, own), type).toEqual(own);
			expect(await readOneByOne(north.owner, type, own), type).toEqual([]);
		}
		for (const [type, table, column] of types.slice(0, 3)) {
			const others = await ids(table, column, "", [], "org-north");
			expect(others.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(north.owner, type, others), type).toEqual(others);
			expect(await readOneByOne(shltr.member, type, others), type).toEqual([]);
		}
	});

	test("lets only managers change all but the classifications", async () => {
		for (const [type, table, column] of types) {
			const [first] = await ids(table, column);
			await as(shltr.member, async () => {
				expect(await mayChange({ type, id: first }), type).toBe(type === "partner_classification");
			});
			await as(shltr.owner, async () => {
				expect(await mayChange({ type, id: first }), type).toBe(true);
			});
		}
	});

	test("finds none of them in a tenant without the module", async () => {
		const sample = await Promise.all(
			types.map(async ([type, table, column]) => ({ type, id: (await ids(table, column))[0] })),
		);
		await withoutModule("shltr", "partner-programme", async () => {
			await as(shltr.owner, async () => {
				for (const subject of sample) expect(await mayRead(subject), subject.type).toBe(false);
			});
		});
	});
});

describe("a field engineer", () => {
	test("reads none of them", async () => {
		for (const [type, table, column] of types) {
			expect(await readOneByOne(shltr.engineer, type, await ids(table, column)), type).toEqual([]);
		}
	});
});

describe("a partner's contact", () => {
	test("reads their customer's partnership, closed years and wallet, no one else's", async () => {
		const mine = await customerOf(riedel);
		for (const [type, table, column, where] of [
			["partner", "partner_account", "customer_id", "and customer_id = ?"],
			["partner_bonus_year", "partner_bonus_year", "id", "and customer_id = ?"],
			["partner_wallet_entry", "partner_wallet_entry", "id", "and customer_id = ?"],
		] as const) {
			const own = await ids(table, column, where, [mine]);
			const all = await ids(table, column);
			expect(own.length, type).toBeGreaterThan(0);
			expect(own.length, type).toBeLessThan(all.length);
			expect(await readOneByOne(riedel, type, all), type).toEqual(own);
			await as(riedel, async () => {
				// Riedel's year is chosen already, so even that one is closed to a change.
				expect(await mayChange({ type, id: own[0] }), type).toBe(false);
			});
		}
	});

	test("reads this year's rules, and no classification", async () => {
		const year = new Date().getFullYear();
		const all = await ids("partner_programme_year", "id");
		const thisYear = await ids("partner_programme_year", "id", "and year = ?", [year]);
		expect(thisYear.length).toBeGreaterThan(0);
		expect(thisYear.length).toBeLessThan(all.length);
		expect(await readOneByOne(riedel, "partner_programme_year", all)).toEqual(thisYear);
		const classifications = await ids("partner_order_classification", "order_id");
		expect(await readOneByOne(riedel, "partner_classification", classifications)).toEqual([]);
	});

	test("changes only their own closed year that has no choice yet", async () => {
		const chosen = await ids(
			"partner_bonus_year",
			"id",
			"and choice is not null and customer_id = ?",
			[await customerOf(weggemans)],
		);
		expect(chosen.length).toBeGreaterThan(0);
		await as(weggemans, async () => {
			expect(await mayChange({ type: "partner_bonus_year", id: chosen[0] })).toBe(false);
		});
		const open = await ids("partner_bonus_year", "id", "and choice is null and customer_id = ?", [
			await customerOf(pakhuis),
		]);
		expect(open.length).toBeGreaterThan(0);
		await as(pakhuis, async () => {
			expect(await mayChange({ type: "partner_bonus_year", id: open[0] })).toBe(true);
		});
		await as(weggemans, async () => {
			expect(await mayChange({ type: "partner_bonus_year", id: open[0] })).toBe(false);
		});
	});
});

describe("a customer that isn't a partner", () => {
	test("reads nothing of the programme, not even this year's rules", async () => {
		// North's contact is for a customer that is no partner.
		const years = await ids("partner_programme_year", "id", "", [], "org-north");
		expect(years.length).toBeGreaterThan(0);
		expect(await readOneByOne(north.customer, "partner_programme_year", years)).toEqual([]);
		const partners = await ids("partner_account", "customer_id", "", [], "org-north");
		expect(await readOneByOne(north.customer, "partner", partners)).toEqual([]);
	});
});
