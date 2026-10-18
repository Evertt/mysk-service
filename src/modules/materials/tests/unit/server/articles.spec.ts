/**
 * The tenant's materials as the condition module's articles (`condition.articles`), by SKU: those
 * with the ids asked for, of the tenant only, and the first so many matching a search by SKU or
 * name, also past the 2,000th of a tenant with that many.
 */
import { beforeAll, expect, test } from "vite-plus/test";

import { materialArticles } from "#modules/materials/server/articles.ts";
import { as, north, organizationId, rows, shltr, value } from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

/** A tenant's materials by SKU, as stored. */
const materialsOf = (organization: string) =>
	rows<{ id: number; sku: string; name: string }>(
		`select id, sku, name from material where organization_id = ? order by sku`,
		[organization],
	);

beforeAll(async () => {
	// 2,500 more of SHLTR's, ZZ-0001 to ZZ-2500: more than a picker could list.
	await value(
		`with recursive n(i) as (select 1 union all select i + 1 from n where i < 2500)
		 insert into material (organization_id, sku, name, unit, unit_price, stock)
		 select ?, 'ZZ-' || printf('%04d', i), 'Veer ' || i, 'pcs', 100, 0 from n`,
		[shltrId],
	);
});

test("those with the ids asked for, by SKU, of the tenant only", async () => {
	const [first, second] = await materialsOf(shltrId);
	const [theirs] = await materialsOf(northId);
	const found = await as(shltr.member, () =>
		materialArticles({ ids: [second.id, theirs.id, first.id] }),
	);
	expect(found).toEqual([first, second]);
	expect(await as(shltr.member, () => materialArticles({ ids: [] }))).toEqual([]);
});

test("the first so many matching every word of a search, in the SKU or the name", async () => {
	await as(shltr.member, async () => {
		const all = await materialArticles({ search: "", limit: 5 });
		expect(all).toEqual((await materialsOf(shltrId)).slice(0, 5));
		expect(await materialArticles({ search: "zz-2500", limit: 5 })).toEqual([
			expect.objectContaining({ sku: "ZZ-2500", name: "Veer 2500" }),
		]);
		const named = await materialArticles({ search: "veer 24", limit: 3 });
		expect(named.map((article) => article.sku)).toEqual(["ZZ-0024", "ZZ-0124", "ZZ-0224"]);
		// `%` and `_` are taken literally.
		expect(await materialArticles({ search: "%", limit: 5 })).toEqual([]);
	});
	// North's search finds none of SHLTR's.
	expect(await as(north.member, () => materialArticles({ search: "ZZ-", limit: 5 }))).toEqual([]);
});
