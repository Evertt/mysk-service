/**
 * The setup forms' schemas (`setup/setup-schema.ts`): what a new site, a site's settings, a zone, a
 * consumer and a door take from their forms, the defaults of what's left empty, and what's refused.
 */
import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	consumerSchema,
	deletePartSchema,
	doorSchema,
	energySiteSchema,
	newEnergySiteSchema,
	zoneSchema,
} from "#modules/energy/setup/setup-schema.ts";

const contract = {
	contractedPeakKw: 320,
	contractedKwhPerYear: 1_000_000,
	tariff: 0.28,
	co2Factor: 0.375,
	timeZone: " Europe/Amsterdam ",
};

/** The messages of what `schema` refuses in `input`, by field. */
function issues(schema: v.GenericSchema, input: unknown) {
	const result = v.safeParse(schema, input);
	if (result.success) return {};
	return Object.fromEntries(
		result.issues.map((issue) => [v.getDotPath(issue) ?? "", issue.message]),
	);
}

describe("a new energy site", () => {
	test("takes a site and its contract; an empty name, meter and panels are defaults", () => {
		expect(v.parse(newEnergySiteSchema, { siteId: "7", name: " ", ...contract })).toEqual({
			siteId: 7,
			name: null,
			meterName: null,
			pvCapacityKw: 0,
			...contract,
			timeZone: "Europe/Amsterdam",
		});
	});

	test("refuses a missing site, a contract without a peak, a tariff of 0 and an unknown time zone", () => {
		expect(
			issues(newEnergySiteSchema, {
				siteId: "",
				...contract,
				contractedPeakKw: undefined,
				tariff: 0,
				timeZone: "Europe/Atlantis",
			}),
		).toEqual({
			siteId: "Choose the customer's site",
			contractedPeakKw: "A number of kW above 0, up to 100,000",
			tariff: "A price per kWh above 0, up to €10",
			timeZone: "A time zone such as Europe/Amsterdam",
		});
		expect(
			issues(newEnergySiteSchema, { siteId: "1", ...contract, contractedKwhPerYear: 1.5 }),
		).toEqual({
			contractedKwhPerYear: "A whole number of kWh, 0 or more",
		});
	});

	test("its settings need a name and a meter's", () => {
		expect(
			issues(energySiteSchema, { energySiteId: "3", name: "", meterName: " ", ...contract }),
		).toEqual({ name: "Fill in a name", meterName: "Name the main connection" });
	});
});

describe("a zone", () => {
	test("takes a code, a name, an optional floor and area; edited with its id", () => {
		expect(
			v.parse(zoneSchema, { energySiteId: "1", code: " Z-A ", name: "Hall A", floor: "" }),
		).toEqual({
			energySiteId: 1,
			zoneId: null,
			code: "Z-A",
			name: "Hall A",
			floor: null,
			areaM2: 0,
		});
		expect(
			v.parse(zoneSchema, { energySiteId: "1", zoneId: "4", code: "Z-A", name: "A", areaM2: 400 }),
		).toMatchObject({ zoneId: 4, areaM2: 400 });
	});

	test("refuses a code the gateway can't send and a part of a square metre", () => {
		expect(
			issues(zoneSchema, { energySiteId: "1", code: "Z".repeat(41), name: "A", areaM2: 1.5 }),
		).toEqual({ code: "Use at most 40 characters", areaM2: "A whole number of m², 0 or more" });
		expect(issues(zoneSchema, { energySiteId: "1", code: " ", name: "A" })).toEqual({
			code: "Fill in the code the gateway sends, up to 40 characters",
		});
	});
});

describe("a consumer", () => {
	test("is in a zone, with its rated power and maybe a unit", () => {
		expect(
			v.parse(consumerSchema, {
				energySiteId: "1",
				zoneId: "2",
				name: "Fan",
				ratedKw: 2.2,
				equipmentId: "",
			}),
		).toEqual({
			energySiteId: 1,
			consumerId: null,
			zoneId: 2,
			name: "Fan",
			ratedKw: 2.2,
			equipmentId: null,
		});
		expect(
			issues(consumerSchema, { energySiteId: "1", zoneId: "", name: "Fan", ratedKw: 0 }),
		).toEqual({
			zoneId: "Choose a zone",
			ratedKw: "A number of kW above 0, up to 100,000",
		});
	});
});

describe("a door", () => {
	const input = {
		energySiteId: "1",
		zoneId: "2",
		code: "D-05",
		name: "Dock 05",
		kind: "sectional",
		lossKw: 11.4,
		thresholdMinutes: 10,
		equipmentId: "9",
	};

	test("takes its kind, loss, threshold and unit; temperatures are optional", () => {
		expect(v.parse(doorSchema, input)).toEqual({
			...input,
			energySiteId: 1,
			doorId: null,
			zoneId: 2,
			equipmentId: 9,
		});
		expect(v.parse(doorSchema, { ...input, insideC: -22, outsideC: 8 })).toMatchObject({
			insideC: -22,
			outsideC: 8,
		});
	});

	test("refuses an unknown kind, a threshold of 0 minutes and an impossible temperature", () => {
		expect(
			issues(doorSchema, { ...input, kind: "revolving", thresholdMinutes: 0, insideC: -300 }),
		).toEqual({
			kind: "Choose one",
			thresholdMinutes: "A whole number of minutes, 1 to 1,440",
			insideC: "A temperature from −80 to 80 °C",
		});
	});
});

test("a part is deleted by its site and its id", () => {
	expect(v.parse(deletePartSchema, { energySiteId: "1", id: "5" })).toEqual({
		energySiteId: 1,
		id: 5,
	});
});
