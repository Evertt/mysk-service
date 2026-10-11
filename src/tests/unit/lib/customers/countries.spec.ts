import { expect, test } from "vite-plus/test";

import { countryName, countryOptions, europeanCountries } from "#lib/customers/countries.ts";

test("the offered countries are sorted and listed once", () => {
	expect(europeanCountries).toEqual([...new Set(europeanCountries)].sort());
});

test("a country's name is the stored one in English", () => {
	for (const country of europeanCountries) expect(countryName(country, "en")).toBe(country);
});

test("in Dutch, a country has its Dutch name", () => {
	expect(countryName("Netherlands", "nl")).toBe("Nederland");
	expect(countryName("Belgium", "nl")).toBe("België");
	expect(countryName("United Kingdom", "nl")).toBe("Verenigd Koninkrijk");
});

test("a country outside the list is shown as stored", () => {
	expect(countryName("Japan", "nl")).toBe("Japan");
});

test("options are each country once, by name", () => {
	expect(countryOptions(["Netherlands", "Belgium", "Japan", "Belgium"])).toEqual([
		{ value: "Belgium", label: "Belgium" },
		{ value: "Japan", label: "Japan" },
		{ value: "Netherlands", label: "Netherlands" },
	]);
});
