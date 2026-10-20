import { expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { conditionList } from "#modules/condition/list/units-list.ts";

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
