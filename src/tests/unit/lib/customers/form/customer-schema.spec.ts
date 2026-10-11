import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { customerFields } from "#lib/customers/form/customer-schema.ts";

/** The parsed value, or the messages of all issues. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(v.object(customerFields), input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

const form = {
	name: "  Acme Facilities ",
	segment: "mid_market",
	contactName: "Jo de Vries",
	email: "Jo@Acme.NL",
	phone: "+31 20 123 4567",
	city: "Utrecht",
	country: "Netherlands",
};

test("a filled-in form becomes a customer, trimmed and with a lower-case email", () => {
	expect(parse(form)).toEqual({
		value: { ...form, name: "Acme Facilities", email: "jo@acme.nl" },
	});
});

test("an empty form says what's missing, once per field", () => {
	const empty = { ...form, name: "", segment: "", contactName: " ", email: "", phone: "" };
	expect(parse({ ...empty, city: "", country: "" })).toEqual({
		issues: [
			"Enter the company name",
			"Choose a segment",
			"Enter a contact person",
			"Enter an email address",
			"Enter a phone number",
			"Enter a city",
			"Choose a country",
		],
	});
});

test("the segment is one of the customer segments", () => {
	expect(parse({ ...form, segment: "government" })).toEqual({ issues: ["Choose a segment"] });
});

test("a country outside the list is accepted, as existing customers may have one", () => {
	expect(parse({ ...form, country: "Japan" })).toHaveProperty("value.country", "Japan");
});
