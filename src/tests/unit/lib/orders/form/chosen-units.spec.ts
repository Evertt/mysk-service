import { expect, test } from "vite-plus/test";

import { chosenUnitIds } from "#lib/orders/form/chosen-units.ts";

test("the order's own units until the field has a value", () => {
	expect(chosenUnitIds(undefined, [14, 11])).toEqual([14, 11]);
	expect(chosenUnitIds(undefined, [])).toEqual([]);
});

test("the field's, in their order, once it has a value", () => {
	expect(chosenUnitIds(["11", "20"], [14, 11])).toEqual([11, 20]);
});

test("none once all are taken off, not the order's again", () => {
	expect(chosenUnitIds([], [14, 11])).toEqual([]);
});
