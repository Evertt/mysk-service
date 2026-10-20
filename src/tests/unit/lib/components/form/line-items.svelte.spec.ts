import { expect, test } from "vite-plus/test";

import { lineItems, withoutValue } from "#lib/components/form/line-items.svelte.ts";

test("rows keep their keys as rows before them are removed", () => {
	const lines = lineItems(() => [{ quantity: 1 }, { quantity: 2 }]);
	lines.add({ quantity: 3 });
	const [, second, third] = lines.rows.map((row) => row.key);

	lines.remove(0);

	expect(lines.rows.map((row) => row.quantity)).toEqual([2, 3]);
	expect(lines.rows.map((row) => row.key)).toEqual([second, third]);
	expect(new Set([second, third]).size).toBe(2);
});

test("reads its initial rows once", () => {
	let calls = 0;
	const lines = lineItems(() => {
		calls++;
		return [{ quantity: 1 }];
	});
	lines.rows[0].quantity = 5;
	expect(lines.rows[0].quantity).toBe(5);
	expect(calls).toBe(1);
});

test("withoutValue() keeps a field's name and validation, not its value", () => {
	expect(withoutValue({ name: "lines[0].quantity", type: "number", value: 4 })).toEqual({
		name: "lines[0].quantity",
		type: "number",
	});
});
