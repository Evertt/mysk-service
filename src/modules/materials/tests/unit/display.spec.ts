import { describe, expect, test } from "vite-plus/test";

import {
	formatQuantity,
	stockLevel,
	stockLevelDisplay,
	stockLevelOptions,
	stockLevels,
	unitOptions,
} from "#modules/materials/display.ts";
import { materialUnits } from "#modules/materials/model.ts";
import { describeBadges, describeOptions } from "#unit/lib/display.test-support.ts";

// Material units are shown as plain text.
describeOptions("material units", unitOptions, materialUnits, { icons: false });
describeOptions("stock levels", stockLevelOptions, stockLevels);

describe("stockLevel", () => {
	test("nothing, or less than nothing, is out of stock", () => {
		expect(stockLevel(0, "pcs")).toBe("out");
		expect(stockLevel(-2, "kg")).toBe("out");
	});

	test("fewer than 10 pieces is low", () => {
		expect(stockLevel(1, "pcs")).toBe("low");
		expect(stockLevel(9, "pcs")).toBe("low");
		expect(stockLevel(10, "pcs")).toBe("in_stock");
	});

	test.each(["m", "kg", "l"] as const)("less than 50 %s is low", (unit) => {
		expect(stockLevel(10, unit)).toBe("low");
		expect(stockLevel(49, unit)).toBe("low");
		expect(stockLevel(50, unit)).toBe("in_stock");
	});
});

test("a quantity is shown with its unit", () => {
	expect(formatQuantity(12, "pcs")).toBe("12 pcs");
	expect(formatQuantity(2.5, "kg")).toBe("2.5 kg");
	// Sums of decimals don't show floating-point noise.
	expect(formatQuantity(0.1 + 0.2, "l")).toBe("0.3 l");
	expect(formatQuantity(1250.75, "m")).toBe("1,250.75 m");
});

describeBadges("stock level badges", stockLevelDisplay, [
	["out", "Out of stock", "danger"],
	["low", "Low", "warning"],
	["in_stock", "In stock", "success"],
]);
