/**
 * Who may read and change the docks (`server/access.ts`), on the seeded database as SHLTR's people:
 * the office reads its tenant's docks and a manager changes them; no portal reads them; and none of
 * it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import { as, demoAccount, north, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");

describe("the docks", () => {
	test("are read by the office of their tenant, not another's", async () => {
		const own = await idsOf("dock_position", "org-shltr");
		expect(own.length).toBeGreaterThan(0);
		expect(await readOneByOne(shltr.member, "dock", own)).toEqual(own);
		expect(await readOneByOne(north.owner, "dock", own)).toEqual([]);
	});

	test("are changed by managers only", async () => {
		const [dock] = await idsOf("dock_position", "org-shltr");
		await as(shltr.member, async () => {
			expect(await mayChange({ type: "dock", id: dock })).toBe(false);
		});
		await as(shltr.owner, async () => {
			expect(await mayChange({ type: "dock", id: dock })).toBe(true);
		});
	});

	test("are not read by an engineer or a customer's contact", async () => {
		const own = await idsOf("dock_position", "org-shltr");
		expect(await readOneByOne(shltr.engineer, "dock", own)).toEqual([]);
		expect(await readOneByOne(riedel, "dock", own)).toEqual([]);
	});

	test("are not found in a tenant without the module", async () => {
		const [dock] = await idsOf("dock_position", "org-shltr");
		await withoutModule("shltr", "docks", async () => {
			await as(shltr.owner, async () => {
				expect(await mayRead({ type: "dock", id: dock })).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			expect(await mayRead({ type: "dock", id: dock })).toBe(true);
		});
	});
});
