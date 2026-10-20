import * as v from "valibot";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import {
	cents,
	customerCode,
	date,
	email,
	hiddenInt,
	id,
	numberIn,
	optionalDate,
	optionalId,
	optionalText,
	optionalTime,
	phone,
	recordId,
	text,
	time,
	wholeIn,
	year,
	yearBounds,
} from "#lib/schema.ts";

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

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

describe("recordId", () => {
	test("is a positive whole number, as JSON sends it", () => {
		expect(parse(recordId(), 1)).toEqual({ value: 1 });
	});

	test.each([0, -1, 1.5, "1", null])("refuses %j", (input) => {
		expect(parse(recordId(), input)).toHaveProperty("issue");
	});
});

describe("customerCode", () => {
	test("is a customer's code", () => {
		expect(parse(customerCode(), "C-00042")).toEqual({ value: "C-00042" });
	});

	test.each(["", "C".repeat(65), 42])("refuses %j", (input) => {
		expect(parse(customerCode(), input)).toHaveProperty("issue");
	});
});

describe("optionalText", () => {
	test("is trimmed, and none if it's left empty", () => {
		expect(parse(optionalText(10), "  Pump  ")).toEqual({ value: "Pump" });
		expect(parse(optionalText(10), "")).toEqual({ value: null });
		expect(parse(optionalText(10), "   ")).toEqual({ value: null });
	});

	test("counts the trimmed text against its limit", () => {
		expect(parse(optionalText(4), "  Pump  ")).toEqual({ value: "Pump" });
	});

	test("says how long it may be, in the user's language", () => {
		expect(parse(optionalText(4), "Pumps")).toEqual({ issue: "Use at most 4 characters" });
		overwriteGetLocale(() => "nl");
		expect(parse(optionalText(4), "Pumps")).toEqual({ issue: "Gebruik maximaal 4 tekens" });
	});
});

test("text is trimmed and required", () => {
	expect(parse(text(), "  Pump  ")).toEqual({ value: "Pump" });
	expect(parse(text("Enter a name"), "   ")).toEqual({ issue: "Enter a name" });
});

describe("dates", () => {
	test("are days", () => {
		const { value } = parse(date(), "2026-10-20") as { value: Temporal.PlainDate };
		expect(value).toBeInstanceOf(Temporal.PlainDate);
		expect(value.toString()).toBe("2026-10-20");
	});

	test("a required date must be there and valid", () => {
		expect(parse(date("Choose a start date"), "")).toEqual({ issue: "Choose a start date" });
		expect(parse(date(), "2026-13-45")).toEqual({ issue: "Enter a valid date" });
		expect(parse(date(), "2026-02-31")).toEqual({ issue: "Enter a valid date" });
	});

	test("an empty required date only says it's required", () => {
		expect(v.safeParse(date(), "").issues).toHaveLength(1);
	});

	test("an optional date may be empty, but not invalid", () => {
		expect(parse(optionalDate(), "")).toEqual({ value: null });
		expect(parse(optionalDate(), "garbage")).toEqual({ issue: "Enter a valid date" });
		expect(parse(optionalDate(), "2026-02-29")).toEqual({ issue: "Enter a valid date" });
	});
});

describe("times of day", () => {
	test("are entered as hours and minutes", () => {
		expect(parse(time(), "13:30")).toEqual({ value: "13:30" });
		expect(parse(time(), "")).toEqual({ issue: "Choose a time" });
		expect(parse(time(), "24:00")).toEqual({ issue: "Enter a valid time" });
		expect(parse(time(), "9:00")).toEqual({ issue: "Enter a valid time" });
	});

	test("an optional time may be empty, but not invalid", () => {
		expect(parse(optionalTime(), "")).toEqual({ value: null });
		expect(parse(optionalTime(), "08:15")).toEqual({ value: "08:15" });
		expect(parse(optionalTime(), "8.15")).toEqual({ issue: "Enter a valid time" });
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

describe("numbers in bounds", () => {
	test("numberIn says its message, or the bound's own", () => {
		const share = numberIn({ above: true, max: 10, message: "Enter it", tooHigh: "Too much" });
		expect(parse(share, 2.5)).toEqual({ value: 2.5 });
		expect(parse(share, undefined)).toEqual({ issue: "Enter it" });
		expect(parse(share, 0)).toEqual({ issue: "Enter it" });
		expect(parse(share, 11)).toEqual({ issue: "Too much" });
	});

	test("wholeIn, hiddenInt and year take whole numbers only", () => {
		expect(parse(wholeIn({ min: 1, fraction: "Whole" }), 1.5)).toEqual({ issue: "Whole" });
		expect(parse(hiddenInt(yearBounds), "2026")).toEqual({ value: 2026 });
		expect(v.safeParse(year(), 1999).success).toBe(false);
	});
});
