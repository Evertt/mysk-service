import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	cents,
	date,
	email,
	id,
	optionalDate,
	optionalId,
	phone,
	text,
	toDateInput,
} from "./schema.ts";

/** The parsed value, or the first issue's message. */
const parse = (schema: v.GenericSchema, input: unknown) => {
	const result = v.safeParse(schema, input);
	return result.success ? { value: result.output } : { issue: result.issues[0].message };
};

describe("id", () => {
	test("turns a positive whole number into a number", () => {
		expect(parse(id(), "42")).toEqual({ value: 42 });
	});

	test.each(["", "0", "-3", "1.5", "abc"])("refuses %j", (input) => {
		expect(parse(id("Choose a customer"), input)).toEqual({ issue: "Choose a customer" });
	});
});

describe("optionalId", () => {
	test("the empty option means none", () => {
		expect(parse(optionalId(), "")).toEqual({ value: null });
	});

	test("otherwise it's an id", () => {
		expect(parse(optionalId(), "7")).toEqual({ value: 7 });
		expect(parse(optionalId("Choose an engineer"), "0")).toHaveProperty("issue");
	});
});

test("text is trimmed and required", () => {
	expect(parse(text(), "  Pump  ")).toEqual({ value: "Pump" });
	expect(parse(text("Enter a name"), "   ")).toEqual({ issue: "Enter a name" });
});

describe("dates", () => {
	test("are local days", () => {
		const { value } = parse(date(), "2026-10-20") as { value: Date };
		expect([value.getFullYear(), value.getMonth(), value.getDate(), value.getHours()]).toEqual([
			2026, 9, 20, 0,
		]);
		expect(toDateInput(value)).toBe("2026-10-20");
	});

	test("a required date must be there and valid", () => {
		expect(parse(date("Choose a start date"), "")).toEqual({ issue: "Choose a start date" });
		expect(parse(date(), "2026-13-45")).toEqual({ issue: "Enter a valid date" });
	});

	test("an optional date may be empty", () => {
		expect(parse(optionalDate(), "")).toEqual({ value: null });
		expect(toDateInput(null)).toBe("");
	});
});

test("cents are entered in euros", () => {
	expect(parse(cents(), 12.345)).toEqual({ value: 1235 });
	expect(parse(cents("Enter a price"), undefined)).toEqual({ issue: "Enter a price" });
	expect(parse(cents(), -1)).toEqual({ issue: "Can't be negative" });
});

describe("email", () => {
	test("is stored in lower case", () => {
		expect(parse(email(), " Jo@Example.COM ")).toEqual({ value: "jo@example.com" });
	});

	test("an empty field only says it's required", () => {
		expect(parse(email(), "")).toEqual({ issue: "Enter an email address" });
		expect(parse(email(), "not an email")).toEqual({ issue: "Enter a valid email address" });
	});
});

test("phone numbers allow the usual punctuation", () => {
	expect(parse(phone(), "+31 (0)20-123.4567")).toEqual({ value: "+31 (0)20-123.4567" });
	expect(parse(phone(), "call me")).toEqual({ issue: "Enter a valid phone number" });
});
