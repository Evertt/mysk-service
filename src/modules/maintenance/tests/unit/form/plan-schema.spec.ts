import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	coveredPlansSchema,
	newPlanSchema,
	planSchema,
} from "#modules/maintenance/form/plan-schema.ts";

const fields = {
	orderType: "maintenance",
	description: "  Annual boiler service ",
	intervalMonths: 12,
	nextDueOn: "2026-11-30",
};

/** The messages a schema has for `input`, or `[]` if it takes it. */
const issues = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success ? [] : result.issues.map((issue) => issue.message);
};

describe("a plan's fields", () => {
	test("take a description, an order type, an interval and the next due date", () => {
		expect(v.parse(newPlanSchema, { equipmentId: "7", ...fields })).toEqual({
			equipmentId: 7,
			orderType: "maintenance",
			description: "Annual boiler service",
			intervalMonths: 12,
			nextDueOn: new Date(2026, 10, 30),
		});
		expect(v.parse(planSchema, { id: "3", ...fields, orderType: "inspection" })).toMatchObject({
			id: 3,
			orderType: "inspection",
		});
	});

	test("need a description and a due date", () => {
		expect(issues(planSchema, { id: "3", ...fields, description: "  " })).toEqual([
			"Describe the visit",
		]);
		expect(issues(planSchema, { id: "3", ...fields, nextDueOn: "" })).toEqual([
			"Choose the day the next visit is due",
		]);
		expect(issues(planSchema, { id: "3", ...fields, nextDueOn: "2026-02-30" })).toHaveLength(1);
	});

	test("take an interval of whole months, 1 to 60", () => {
		for (const intervalMonths of [1, 60]) {
			expect(issues(planSchema, { id: "3", ...fields, intervalMonths })).toEqual([]);
		}
		for (const intervalMonths of [0, 61, 1.5, undefined]) {
			expect(issues(planSchema, { id: "3", ...fields, intervalMonths })).toEqual([
				"Between 1 and 60 months",
			]);
		}
	});

	test("make only maintenance and inspection orders", () => {
		expect(issues(planSchema, { id: "3", ...fields, orderType: "repair" })).toHaveLength(1);
	});
});

describe("a plan for each covered unit", () => {
	test("takes the units' ids as a list, deduplicated and sorted", () => {
		const { nextDueOn: _nextDueOn, ...rest } = fields;
		expect(v.parse(coveredPlansSchema, { equipmentIds: "12,3,12", ...rest })).toMatchObject({
			equipmentIds: [3, 12],
			description: "Annual boiler service",
		});
		for (const equipmentIds of ["", "1,,2", "0", "a,1", "-1"]) {
			expect(issues(coveredPlansSchema, { equipmentIds, ...rest })).not.toEqual([]);
		}
	});
});
