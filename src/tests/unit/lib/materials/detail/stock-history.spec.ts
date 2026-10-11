import { expect, test } from "vite-plus/test";

import { formatChange } from "#lib/materials/detail/stock-history.ts";

test("a change shows its sign and unit", () => {
	expect(formatChange(12, "pcs")).toBe("+12 pcs");
	expect(formatChange(-2.5, "kg")).toBe("−2.5 kg");
	// Differences of decimals don't show floating-point noise.
	expect(formatChange(0.3 - 0.1, "l")).toBe("+0.2 l");
});
