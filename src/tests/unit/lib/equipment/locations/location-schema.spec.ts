import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { locationSchema, newLocationSchema } from "#lib/equipment/locations/location-schema.ts";
import { qrTokenPattern, qrUrl } from "#lib/equipment/qr.ts";

/** The parsed value, or the messages of all issues. */
const parse = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

test("a new location is a site's, named, maybe described", () => {
	expect(parse(newLocationSchema, { siteId: "4", name: " Dock 03 ", description: "  " })).toEqual({
		value: { siteId: 4, name: "Dock 03", description: null },
	});
	expect(parse(locationSchema, { id: "9", name: "Hal A", description: " Links " })).toEqual({
		value: { id: 9, name: "Hal A", description: "Links" },
	});
});

test("it needs a name, and neither may be long", () => {
	expect(parse(newLocationSchema, { siteId: "4", name: " ", description: "" })).toEqual({
		issues: ["Enter the location's name"],
	});
	expect(
		parse(locationSchema, { id: "9", name: "A".repeat(81), description: "B".repeat(201) }),
	).toEqual({ issues: ["Use at most 80 characters", "Use at most 200 characters"] });
});

test("a QR code holds the app's /q/ URL of its token", () => {
	expect(qrUrl("https://app.example", "0123456789abcdef01234567")).toBe(
		"https://app.example/q/0123456789abcdef01234567",
	);
	expect(qrTokenPattern.test("0123456789abcdef01234567")).toBe(true);
	expect(qrTokenPattern.test("0123456789ABCDEF01234567")).toBe(false);
	expect(qrTokenPattern.test("12")).toBe(false);
});
