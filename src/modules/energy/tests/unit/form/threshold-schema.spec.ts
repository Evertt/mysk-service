/**
 * A zone's thresholds as their row on the thresholds page submits them (`form/threshold-schema.ts`):
 * the zone, whether its alerts are on (an unchecked box isn't sent) and two amounts, each above 0
 * and up to 100,000.
 */
import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { thresholdSchema } from "#modules/energy/form/threshold-schema.ts";

/** The messages of what the schema refuses in `input`, by field. */
function issues(input: unknown) {
	const result = v.safeParse(thresholdSchema, input);
	if (result.success) return {};
	return Object.fromEntries(
		result.issues.map((issue) => [v.getDotPath(issue) ?? "", issue.message]),
	);
}

const row = { zoneId: "12", enabled: true, maxKw: 55, maxKwh: 300 };

describe("a zone's thresholds", () => {
	test("take the zone's id from its hidden field, and the amounts", () => {
		expect(v.parse(thresholdSchema, row)).toEqual({
			zoneId: 12,
			enabled: true,
			maxKw: 55,
			maxKwh: 300,
		});
	});

	test("are off when the box isn't sent", () => {
		const { enabled: _enabled, ...unchecked } = row;
		expect(v.parse(thresholdSchema, unchecked)).toMatchObject({ enabled: false });
	});

	test.each([0, -1, 100_001, Number.NaN, Number.POSITIVE_INFINITY])(
		"refuse %s as an amount",
		(amount) => {
			expect(issues({ ...row, maxKw: amount, maxKwh: amount })).toEqual({
				maxKw: "A number above 0, up to 100,000",
				maxKwh: "A number above 0, up to 100,000",
			});
		},
	);

	test("take 100,000 and a fraction above 0", () => {
		expect(issues({ ...row, maxKw: 100_000, maxKwh: 0.5 })).toEqual({});
	});

	test("refuse an amount that's no number, and a zone that's no id", () => {
		expect(issues({ ...row, maxKw: "55", zoneId: "zone" })).toMatchObject({
			maxKw: "A number above 0, up to 100,000",
			zoneId: expect.any(String),
		});
		expect(issues({ ...row, zoneId: "0" })).toHaveProperty("zoneId");
	});
});
