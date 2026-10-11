import { expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { urlGrammar } from "#lib/components/data-table/server-table.svelte.ts";
import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { tableUrlSpec } from "#lib/components/data-table/url-sync.svelte.ts";
import { columns } from "#modules/maintenance/list/columns.ts";
import { dueList } from "#modules/maintenance/list/due-list.ts";

test("the table reads and writes the URL as the due list says", () => {
	const table = createAppTable({
		columns,
		data: [],
		initialState: { ...dueList.urlSpec.defaults },
	});
	expect(urlGrammar(tableUrlSpec(table))).toEqual(urlGrammar(dueList.urlSpec));
});

test("the range is overdue plus the next 30 days, unless the URL says otherwise", () => {
	const query = (search: string) =>
		toListQuery(dueList, parseTableUrl(new URLSearchParams(search), dueList.urlSpec));
	expect(query("").filters).toEqual({ due: ["30-days"] });
	expect(query("").sort).toEqual([{ id: "nextDue", desc: false }]);
	expect(query("due=overdue").filters).toEqual({ due: ["overdue"] });
	// Every plan.
	expect(query("due=").filters).toEqual({});
	expect(query("due=next-year").filters).toEqual({ due: ["30-days"] });
});
