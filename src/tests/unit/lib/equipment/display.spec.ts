import { describe, expect, test } from "vite-plus/test";

import { categoryOptions, isUnderWarranty, statusOptions } from "#lib/equipment/display.ts";
import { equipmentCategories, equipmentStatuses } from "#lib/models.ts";
import { at, day } from "#unit/temporal-support.ts";

import { describeOptions } from "../display.test-support.ts";

describeOptions("equipment categories", categoryOptions, equipmentCategories);
// Equipment statuses are shown as plain text.
describeOptions("equipment statuses", statusOptions, equipmentStatuses, { icons: false });

describe("isUnderWarranty", () => {
	const until = day("2026-10-20");

	test("covers work up to and including its last day", () => {
		expect(isUnderWarranty(until, at("2026-10-19 23:59"))).toBe(true);
		expect(isUnderWarranty(until, day("2026-10-20"))).toBe(true);
		expect(isUnderWarranty(until, at("2026-10-20 23:59"))).toBe(true);
	});

	test("no longer covers work after it", () => {
		expect(isUnderWarranty(until, day("2026-10-21"))).toBe(false);
	});

	test("is about now unless told otherwise", () => {
		const today = Temporal.Now.plainDateISO();
		expect(isUnderWarranty(today.add({ days: 1 }))).toBe(true);
		expect(isUnderWarranty(today.subtract({ days: 1 }))).toBe(false);
	});
});

test("status options are the translated statuses, in order", () => {
	expect(statusOptions).toEqual([
		{ value: "operational", label: "Operational" },
		{ value: "needs_service", label: "Needs service" },
		{ value: "out_of_service", label: "Out of service" },
		{ value: "decommissioned", label: "Decommissioned" },
	]);
	expect(statusOptions.map((option) => option.value)).toEqual(equipmentStatuses);
});
