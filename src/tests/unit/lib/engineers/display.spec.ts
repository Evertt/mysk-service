import { describe, expect, test } from "vite-plus/test";

import { fittingFirst, specialtyOptions } from "#lib/engineers/display.ts";
import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";

describeOptions("engineer specialties", specialtyOptions, engineerSpecialties);

describe("fittingFirst", () => {
	const engineers: { name: string; specialty: EngineerSpecialty }[] = [
		{ name: "Anna", specialty: "electrical" },
		{ name: "Bram", specialty: "hvac" },
		{ name: "Cas", specialty: "mechanical" },
		{ name: "Dirk", specialty: "hvac" },
		{ name: "Eva", specialty: "plumbing" },
	];
	const names = (sorted: typeof engineers) => sorted.map((engineer) => engineer.name);

	test("puts the fitting specialty's engineers first, in the order given", () => {
		expect(names(fittingFirst(engineers, ["hvac"]))).toEqual([
			"Bram",
			"Dirk",
			"Anna",
			"Cas",
			"Eva",
		]);
	});

	test("orders several specialties as given: the first unit's first", () => {
		expect(names(fittingFirst(engineers, ["plumbing", "hvac", "plumbing"]))).toEqual([
			"Eva",
			"Bram",
			"Dirk",
			"Anna",
			"Cas",
		]);
	});

	test("keeps the order given without a fitting specialty", () => {
		expect(names(fittingFirst(engineers, []))).toEqual(names(engineers));
		expect(names(fittingFirst(engineers, [null]))).toEqual(names(engineers));
		expect(names(fittingFirst(engineers, [null, "mechanical"]))).toEqual([
			"Cas",
			"Anna",
			"Bram",
			"Dirk",
			"Eva",
		]);
	});

	test("leaves the given list as it is", () => {
		const before = names(engineers);
		fittingFirst(engineers, ["plumbing"]);
		expect(names(engineers)).toEqual(before);
	});
});
