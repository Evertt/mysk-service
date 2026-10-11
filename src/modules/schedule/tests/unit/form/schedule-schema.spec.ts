import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { id } from "#lib/schema.ts";

import { moveFields, scheduleFields } from "./schedule-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (schema: v.GenericSchema, input: Record<string, unknown>) => {
	const result = v.safeParse(schema, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

const dialog = v.object({ id: id(), ...scheduleFields });
const move = v.object(moveFields);

test("the dialog's fields become a plan", () => {
	expect(parse(dialog, { id: "12", engineerId: "3", day: "2026-10-08", time: "13:45" })).toEqual({
		value: { id: 12, engineerId: 3, day: new Date(2026, 9, 8), time: "13:45" },
	});
});

test("no engineer is unassigned", () => {
	expect(
		parse(dialog, { id: "12", engineerId: "", day: "2026-10-08", time: "09:00" }),
	).toMatchObject({ value: { engineerId: null } });
});

test("a date and a time are required, and must be valid", () => {
	expect(parse(dialog, { id: "12", engineerId: "", day: "", time: "" })).toEqual({
		issues: ["Choose a date", "Choose a time"],
	});
	expect(parse(dialog, { id: "12", engineerId: "", day: "2026-02-30", time: "24:00" })).toEqual({
		issues: ["Enter a valid date", "Enter a valid time"],
	});
	expect(parse(dialog, { id: "12", engineerId: "", day: "2026-10-08", time: "9:00" })).toEqual({
		issues: ["Enter a valid time"],
	});
});

test("a move takes ids as numbers, with null for unassigned", () => {
	expect(parse(move, { id: 12, engineerId: null, day: "2026-10-08", time: "07:30" })).toEqual({
		value: { id: 12, engineerId: null, day: new Date(2026, 9, 8), time: "07:30" },
	});
	expect(parse(move, { id: "12", engineerId: 0, day: "2026-10-08", time: "07:30" })).toMatchObject({
		issues: expect.arrayContaining([expect.any(String)]),
	});
});
