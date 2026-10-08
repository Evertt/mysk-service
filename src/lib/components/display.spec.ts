import { describe, expect, test } from "vite-plus/test";

import { contractLevels, contractStatuses } from "#lib/components/contracts/model.js";
import {
	customerSegments,
	engineerSpecialties,
	equipmentCategories,
	equipmentStatuses,
	materialUnits,
	orderPriorities,
	orderStatuses,
	orderTypes,
} from "#lib/models.js";

import * as contracts from "./contracts/display.ts";
import * as customers from "./customers/display.ts";
import * as engineers from "./engineers/display.ts";
import * as equipment from "./equipment/display.ts";
import * as materials from "./materials/display.ts";
import * as orders from "./orders/display.ts";

interface Option {
	value: string;
	label: string;
	icon?: unknown;
}

/** Each domain's options for filters and selects, with the values they must offer. */
const optionLists: [string, readonly Option[], readonly string[]][] = [
	["contract levels", contracts.levelOptions, contractLevels],
	["contract statuses", contracts.statusOptions, contractStatuses],
	["customer segments", customers.segmentOptions, customerSegments],
	["engineer specialties", engineers.specialtyOptions, engineerSpecialties],
	["equipment categories", equipment.categoryOptions, equipmentCategories],
	["equipment statuses", equipment.statusOptions, equipmentStatuses],
	["material units", materials.unitOptions, materialUnits],
	["stock levels", materials.stockLevelOptions, materials.stockLevels],
	["order statuses", orders.statusOptions, orderStatuses],
	["order priorities", orders.priorityOptions, orderPriorities],
	["order types", orders.typeOptions, orderTypes],
];

/** Equipment statuses and material units are shown as plain text. */
const withIcons = optionLists.filter(
	([name]) => !["equipment statuses", "material units"].includes(name),
);

describe.each(optionLists)("%s", (_, options, values) => {
	test("offer every value once, in the order of the enum", () => {
		expect(options.map((option) => option.value)).toEqual(values);
	});

	test("have a distinct label for each value", () => {
		const labels = options.map((option) => option.label);
		expect(labels.every((label) => label.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

test.each(withIcons)("%s have an icon for each value", (_, options) => {
	expect(options.every((option) => typeof option.icon === "function")).toBe(true);
});
