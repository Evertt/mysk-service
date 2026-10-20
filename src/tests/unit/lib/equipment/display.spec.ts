import { describe, expect, test } from "vite-plus/test";

import {
	equipmentStatusDisplay,
	isUnderWarranty,
	statusOptions,
	unitLine,
	unitTitle,
} from "#lib/equipment/display.ts";
import { equipmentStatuses } from "#lib/models.ts";
import { at, day } from "#unit/temporal-support.ts";

import { describeBadges, describeOptions } from "../display.test-support.ts";

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

describe("a unit's name", () => {
	const unit = { name: null, manufacturer: "Hörmann", model: "ST 50", serialNumber: "H1234567" };
	const named = { ...unit, name: "Automatische deur kantine BES-3" };

	test("is the customer's own for it, if it has one, else its make", () => {
		expect(unitTitle(unit)).toBe("Hörmann ST 50");
		expect(unitTitle(named)).toBe("Automatische deur kantine BES-3");
	});

	test("under it, its line says the make if the title doesn't, then the serial number", () => {
		expect(unitLine(unit)).toBe("H1234567");
		expect(unitLine(named)).toBe("Hörmann ST 50 · H1234567");
	});

	test("then the page's extras, always in this order: category, site, location", () => {
		expect(unitLine(named, { location: "Dock 03", site: "Ede", category: "Overheaddeur" })).toBe(
			"Hörmann ST 50 · H1234567 · Overheaddeur · Ede · Dock 03",
		);
		// Those it hasn't, or the page leaves out, aren't there.
		expect(unitLine(unit, { category: null, site: "Ede", location: undefined })).toBe(
			"H1234567 · Ede",
		);
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

describeBadges(
	"equipment status badges",
	equipmentStatusDisplay,
	[
		["operational", "Operational", "success"],
		["needs_service", "Needs service", "warning"],
		["out_of_service", "Out of service", "danger"],
		["decommissioned", "Decommissioned", "neutral"],
	],
	{ icons: false },
);
