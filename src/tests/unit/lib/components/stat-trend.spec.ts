import { describe, expect, test } from "vite-plus/test";

import { compare, formatChange, formatShare } from "#lib/components/stat-trend.ts";

describe("compare", () => {
	test("says which way a figure went, by how much and by what share", () => {
		expect(compare(118, 100)).toEqual({
			direction: "up",
			tone: "success",
			change: 18,
			share: 0.18,
		});
		expect(compare(90, 100)).toMatchObject({ direction: "down", tone: "danger", change: -10 });
		expect(compare(5, 5)).toMatchObject({
			direction: "flat",
			tone: "neutral",
			change: 0,
			share: 0,
		});
	});

	test("colours a fall as good news when less is better, and neither when it's neither", () => {
		expect(compare(3, 5, "down").tone).toBe("success");
		expect(compare(7, 5, "down").tone).toBe("danger");
		expect(compare(7, 5, "none").tone).toBe("neutral");
	});

	test("has no share when there was nothing before", () => {
		expect(compare(4, 0)).toMatchObject({ direction: "up", change: 4, share: null });
	});
});

describe("formatting a change", () => {
	test("gives it its sign, in either language", () => {
		expect(formatChange(3, "en")).toBe("+3");
		expect(formatChange(-2, "en")).toBe("-2");
		expect(formatChange(0, "en")).toBe("0");
		expect(formatShare(0.18, "en")).toBe("+18%");
		expect(formatShare(-0.054, "nl")).toBe("-5%");
	});
});
