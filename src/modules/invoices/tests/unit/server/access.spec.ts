/**
 * Who may read and change the invoices module's records (`server/access.ts`), on the seeded
 * database: the office reads its tenant's invoices, credit notes and their lines, and changes
 * them; only managers change the invoicing settings; neither portal reads any of it; and none of
 * it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import {
	as,
	demoAccount,
	north,
	shltr,
	south,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");

const tables = ["invoice", "invoice_line", "credit_note", "credit_note_line"] as const;

describe("the office", () => {
	test("reads the invoices, credit notes and lines of its tenant, not another's", async () => {
		for (const table of tables) {
			const own = (await idsOf(table, "org-north")).slice(0, 10);
			expect(own.length, table).toBeGreaterThan(0);
			expect(await readOneByOne(north.member, table, own), table).toEqual(own);
			expect(await readOneByOne(south.member, table, own), table).toEqual([]);
			expect(await readOneByOne(shltr.member, table, own), table).toEqual([]);
		}
	});

	test("changes them, members included", async () => {
		for (const table of tables) {
			const [id] = await idsOf(table, "org-north");
			await as(north.member, async () => {
				expect(await mayChange({ type: table, id }), table).toBe(true);
			});
		}
	});

	test("reads the invoicing settings, and only managers change them", async () => {
		await as(north.member, async () => {
			expect(await mayRead({ type: "invoicing_settings", id: "tenant" })).toBe(true);
			expect(await mayChange({ type: "invoicing_settings", id: "tenant" })).toBe(false);
		});
		await as(north.owner, async () => {
			expect(await mayChange({ type: "invoicing_settings", id: "tenant" })).toBe(true);
		});
	});

	test("finds none of them in a tenant without the module", async () => {
		const [id] = await idsOf("invoice", "org-north");
		await withoutModule("north", "invoices", async () => {
			await as(north.owner, async () => {
				expect(await mayRead({ type: "invoice", id })).toBe(false);
				expect(await mayRead({ type: "invoicing_settings", id: "tenant" })).toBe(false);
			});
		});
		await as(north.owner, async () => {
			expect(await mayRead({ type: "invoice", id })).toBe(true);
		});
	});
});

describe("the portals", () => {
	test("a field engineer reads none of them", async () => {
		for (const table of tables) {
			const ids = (await idsOf(table, "org-shltr")).slice(0, 10);
			expect(await readOneByOne(shltr.engineer, table, ids), table).toEqual([]);
		}
		await as(shltr.engineer, async () => {
			expect(await mayRead({ type: "invoicing_settings", id: "tenant" })).toBe(false);
		});
	});

	test("a customer's contact reads none of them", async () => {
		for (const table of tables) {
			const ids = (await idsOf(table, "org-shltr")).slice(0, 10);
			expect(await readOneByOne(riedel, table, ids), table).toEqual([]);
		}
		await as(riedel, async () => {
			expect(await mayRead({ type: "invoicing_settings", id: "tenant" })).toBe(false);
		});
	});
});
