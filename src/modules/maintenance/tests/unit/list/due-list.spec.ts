import { expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { dueList } from "#modules/maintenance/list/due-list.ts";

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
