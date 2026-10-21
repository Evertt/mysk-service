/**
 * Who may read and change the energy module's records (`server/access.ts`), on the seeded database
 * as SHLTR's people: the office reads the site, its zones, consumers, doors, alerts and thresholds;
 * Riedel's contact the site, zones, thresholds and doors of their own sites (as the portal's figures
 * show them), not the consumers and alerts; managers change the setup, members the alerts; and none
 * of it exists for a tenant without the module.
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

/** The ids of `table`'s records in SHLTR, by `column`, as text; `where` is more SQL. */
const ids = async (table: string, column = "id", where = "", args: (string | number)[] = []) =>
	(
		await rows<{ id: number | string }>(
			`select ${column} as id from "${table}" where organization_id = 'org-shltr' ${where} order by 1`,
			args,
		)
	).map((row) => String(row.id));

/** Energy types: the subject type, its table, and the column its subject id is. */
const types = [
	["energy_site", "energy_site", "id"],
	["energy_zone", "energy_zone", "id"],
	["energy_consumer", "energy_consumer", "id"],
	["energy_door", "energy_door", "id"],
	["energy_alert", "energy_alert", "id"],
	["energy_threshold", "energy_threshold", "zone_id"],
] as const;

/** Riedel's customer, and the energy site's id. */
const customerId = () =>
	value<number>(
		`select c.customer_id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
		[riedel.email],
	);

describe("the office", () => {
	test("reads every record of its tenant, and another tenant's office none", async () => {
		for (const [type, table, column] of types) {
			const own = await ids(table, column);
			expect(own.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(shltr.member, type, own), type).toEqual(own);
			expect(await readOneByOne(north.owner, type, own), type).toEqual([]);
		}
	});

	test("lets only managers change the setup, and any member the alerts", async () => {
		for (const [type, table, column] of types) {
			const [first] = await ids(table, column);
			await as(shltr.member, async () => {
				expect(await mayChange({ type, id: first }), type).toBe(type === "energy_alert");
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
		await withoutModule("shltr", "energy", async () => {
			await as(shltr.owner, async () => {
				for (const subject of sample) expect(await mayRead(subject), subject.type).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			for (const subject of sample) expect(await mayRead(subject), subject.type).toBe(true);
		});
	});
});

describe("a field engineer", () => {
	test("reads none of them: no portal of theirs shows the energy", async () => {
		for (const [type, table, column] of types) {
			expect(await readOneByOne(shltr.engineer, type, await ids(table, column)), type).toEqual([]);
		}
	});
});

describe("a customer's contact", () => {
	test("reads the site, zones, thresholds and doors of their customer's sites, not the consumers and alerts", async () => {
		const mine = await customerId();
		const ofMine = `and energy_site_id in (select es.id from energy_site es join customer_site s on s.id = es.site_id where s.customer_id = ${mine})`;
		for (const [type, table, column, where] of [
			[
				"energy_site",
				"energy_site",
				"id",
				`and site_id in (select id from customer_site where customer_id = ${mine})`,
			],
			["energy_zone", "energy_zone", "id", ofMine],
			["energy_door", "energy_door", "id", ofMine],
			[
				"energy_threshold",
				"energy_threshold",
				"zone_id",
				`and zone_id in (select id from energy_zone where true ${ofMine})`,
			],
		] as const) {
			const own = await ids(table, column, where);
			const all = await ids(table, column);
			expect(own.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(riedel, type, all), type).toEqual(own);
			expect(await readOneByOne(weggemans, type, all), type).toEqual([]);
			await as(riedel, async () => {
				expect(await mayChange({ type, id: own[0] }), type).toBe(false);
			});
		}
		for (const [type, table] of [
			["energy_consumer", "energy_consumer"],
			["energy_alert", "energy_alert"],
		] as const) {
			expect(await readOneByOne(riedel, type, await ids(table)), type).toEqual([]);
		}
	});

	test("limited to other sites than the energy site, reads none of it", async () => {
		const mine = await customerId();
		// Riedel has the one site, which has the energy: add another for the contact to be limited to.
		const [{ id: other }] = await rows<{ id: number }>(
			`insert into customer_site (organization_id, customer_id, name, city, country)
			 values ('org-shltr', ?, 'Annex', 'Ede', 'NL') returning id`,
			[mine],
		);
		const [contact] = await rows<{ id: number }>(
			`select c.id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
			[riedel.email],
		);
		await rows(`update portal_contact set all_sites = 0 where id = ?`, [contact.id]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values ('org-shltr', ?, ?, ?)`,
			[contact.id, mine, other],
		);
		for (const [type, table, column] of types) {
			expect(await readOneByOne(riedel, type, await ids(table, column)), type).toEqual([]);
		}
	});
});
