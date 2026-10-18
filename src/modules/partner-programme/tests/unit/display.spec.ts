import { describe, expect, test } from "vite-plus/test";

import { formatProgress } from "#modules/partner-programme/display.ts";
import { defaultTiers, progressFor } from "#modules/partner-programme/model.ts";

describe("formatProgress", () => {
	test("rounds the revenue down and what's left up, so the threshold isn't met before it is", () => {
		const revenue = 4_999_950;
		expect(formatProgress(revenue, progressFor(defaultTiers, revenue)!)).toEqual({
			revenue: "€49,999",
			threshold: "€50,000",
			remaining: "€1",
		});
	});

	test("shows whole euros as they are", () => {
		const revenue = 20_000_000;
		expect(formatProgress(revenue, progressFor(defaultTiers, revenue)!)).toEqual({
			revenue: "€200,000",
			threshold: "€250,000",
			remaining: "€50,000",
		});
	});
});
