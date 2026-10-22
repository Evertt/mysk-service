/**
 * Who may read and change the contracts module's records (`server/access.ts`), on the seeded
 * database: the office reads and changes its tenant's contracts; neither portal reads one; and a
 * tenant without the module finds none.
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

describe("the office", () => {
	test("reads its tenant's contracts, not another's, and changes them", async () => {
		const own = (await idsOf("contract", "org-north")).slice(0, 10);
		expect(own.length).toBeGreaterThan(0);
		expect(await readOneByOne(north.member, "contract", own)).toEqual(own);
		expect(await readOneByOne(shltr.member, "contract", own)).toEqual([]);
		await as(north.member, async () => {
			expect(await mayChange({ type: "contract", id: own[0] })).toBe(true);
		});
	});

	test("finds none in a tenant without the module", async () => {
		const [id] = await idsOf("contract", "org-north");
		await withoutModule("north", "contracts", async () => {
			await as(north.owner, async () => {
				expect(await mayRead({ type: "contract", id })).toBe(false);
			});
		});
		await as(south.owner, async () => {
			expect(await mayRead({ type: "contract", id })).toBe(false);
		});
		await as(north.owner, async () => {
			expect(await mayRead({ type: "contract", id })).toBe(true);
		});
	});
});

describe("the portals", () => {
	test("neither a field engineer nor a customer's contact reads a contract", async () => {
		const ids = (await idsOf("contract", "org-shltr")).slice(0, 10);
		expect(ids.length).toBeGreaterThan(0);
		expect(await readOneByOne(shltr.engineer, "contract", ids)).toEqual([]);
		expect(await readOneByOne(riedel, "contract", ids)).toEqual([]);
	});
});
