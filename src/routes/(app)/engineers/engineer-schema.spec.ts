import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { engineerFields } from "./engineer-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(v.object(engineerFields), input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

const form = {
	name: "Sam Bakker",
	email: "sam@example.com",
	phone: "06 1234 5678",
	specialty: "hvac",
	region: "North",
	hourlyRate: 72.5,
	hiredAt: "2024-03-01",
	active: true,
};

test("a filled-in form becomes an engineer, with the rate in cents", () => {
	expect(parse(form)).toEqual({
		value: { ...form, hourlyRate: 7250, hiredAt: new Date(2024, 2, 1) },
	});
});

test("an unchecked active box means inactive", () => {
	const { active: _, ...unchecked } = form;
	expect(parse(unchecked)).toHaveProperty("value.active", false);
});

test("the specialty and region are chosen from the lists", () => {
	expect(parse({ ...form, specialty: "welding", region: "Abroad" })).toEqual({
		issues: ["Choose a specialty", "Choose a region"],
	});
});

test("the hourly rate and hire date are required", () => {
	expect(parse({ ...form, hourlyRate: undefined })).toEqual({ issues: ["Enter an hourly rate"] });
	expect(parse({ ...form, hiredAt: "" })).toHaveProperty("issues.0", "Enter the hire date");
});

test("the hourly rate can't be negative", () => {
	expect(parse({ ...form, hourlyRate: -10 })).toEqual({ issues: ["Can't be negative"] });
});
