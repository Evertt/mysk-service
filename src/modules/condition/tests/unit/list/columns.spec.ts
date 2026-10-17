import { expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { urlGrammar } from "#lib/components/data-table/server-table.svelte.ts";
import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { columns } from "#modules/condition/list/columns.ts";
import { conditionList } from "#modules/condition/list/units-list.ts";

test("the table reads and writes the URL as the Connect list says", () => {
	const table = createAppTable({
		columns,
		data: [],
		initialState: { ...conditionList.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(conditionList.urlSpec));
});

test("the list is worst first, and the chips and the checkbox are filters in the URL", () => {
	const query = (search: string) =>
		toListQuery(conditionList, parseTableUrl(new URLSearchParams(search), conditionList.urlSpec));
	expect(query("").sort).toEqual([{ id: "status", desc: false }]);
	expect(query("").filters).toEqual({});
	expect(query("customer=RIE-001&status=critical,attention").filters).toEqual({
		customer: ["RIE-001"],
		// Canonical: sorted.
		status: ["attention", "critical"],
	});
	// Unknown values are dropped.
	expect(query("status=broken").filters).toEqual({});
});
