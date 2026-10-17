import { en, Faker, nl } from "@faker-js/faker";
import { describe, expect, test } from "vite-plus/test";

import { generateLocations, seedQrToken } from "#lib/server/db/seed/locations.ts";
import { generateShltrTenant } from "#lib/server/db/seed/shltr/index.ts";

describe("the demo's locations", () => {
	test("are the places of each site's units, once whatever the case, in alphabetical order", () => {
		const units = new Map([
			[1, { siteId: 2, location: "Dock 03" }],
			[2, { siteId: 2, location: " dock 03 " }],
			[3, { siteId: 2, location: "Bordes" }],
			[4, { siteId: 1, location: "Dock 03" }],
			[5, { siteId: 1, location: null }],
			[6, { siteId: 1, location: "" }],
		]);
		const { locations, locationOf } = generateLocations(units);
		expect(locations).toEqual([
			{ id: 1, siteId: 1, name: "Dock 03", position: 0 },
			{ id: 2, siteId: 2, name: "Bordes", position: 0 },
			{ id: 3, siteId: 2, name: "Dock 03", position: 1 },
		]);
		expect([...locationOf]).toEqual([
			[1, 3],
			[2, 3],
			[3, 2],
			[4, 1],
		]);
	});

	test("SHLTR's units are at the mockup's locations", () => {
		const faker = new Faker({ locale: [nl, en] });
		faker.seed(20261016);
		const { placed } = generateShltrTenant(faker);
		const { locations, locationOf } = generateLocations(placed.units);
		const names = new Set(locations.map((location) => location.name));
		for (const name of [
			"Expeditie noord",
			"Dock 03",
			"Dock 05",
			"Hal A",
			"Kantoor 1e",
			"Serverruimte",
		]) {
			expect(names).toContain(name);
		}
		// Each unit with a place is at a location of its own site.
		for (const [unit, location] of locationOf) {
			const site = locations.find((each) => each.id === location)!.siteId;
			expect(site).toBe(placed.units.get(unit)!.siteId);
		}
	});

	test("have QR tokens like the app's, the same every time, a different one per record", () => {
		const token = seedQrToken("shltr", "unit", "ABC123");
		expect(token).toMatch(/^[0-9a-f]{24}$/);
		expect(seedQrToken("shltr", "unit", "ABC123")).toBe(token);
		expect(seedQrToken("north", "unit", "ABC123")).not.toBe(token);
		expect(seedQrToken("shltr", "location", "ABC123")).not.toBe(token);
	});
});
