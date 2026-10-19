import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { newSiteSchema, siteSchema, slotProblem } from "#lib/customers/form/site-schema.ts";

/** The parsed value, or the messages of all issues by field. */
const parse = (schema: v.GenericSchema, input: Record<string, unknown>) => {
	const result = v.safeParse(schema, input);
	return result.success
		? { value: result.output }
		: {
				issues: result.issues.map((issue) => [v.getDotPath(issue), issue.message]),
			};
};

const form = {
	name: " Ede ",
	address: "Galvanistraat 1",
	postalCode: "6716 AE",
	city: "Ede",
	country: "Netherlands",
	contactName: "",
	contactPhone: "",
	contactEmail: "",
	contactChannel: "",
	preferredDay: "",
	slotStart: "",
	slotEnd: "",
	priority: "normal",
	accessNotes: "",
};

test("a filled-in form becomes a site, the empty extras nothing", () => {
	expect(parse(siteSchema, { ...form, id: "4" })).toEqual({
		value: {
			...form,
			id: 4,
			name: "Ede",
			contactName: null,
			contactPhone: null,
			contactEmail: null,
			contactChannel: null,
			preferredDay: null,
			slotStart: null,
			slotEnd: null,
			accessNotes: null,
		},
	});
});

test("the preferences and notes are kept, the email in lower case", () => {
	const filled = {
		...form,
		customerId: "7",
		contactName: "Jan Riedel",
		contactPhone: "06 12345678",
		contactEmail: "Jan@Riedel.NL",
		contactChannel: "whatsapp",
		preferredDay: "tuesday",
		slotStart: "07:00",
		slotEnd: "15:00",
		priority: "high",
		accessNotes: " Melden bij receptie expeditie noord. ",
	};
	expect(parse(newSiteSchema, filled)).toEqual({
		value: {
			...filled,
			customerId: 7,
			name: "Ede",
			contactEmail: "jan@riedel.nl",
			accessNotes: "Melden bij receptie expeditie noord.",
		},
	});
});

test("an empty form says what's missing", () => {
	const empty = { ...form, id: "4", name: "", address: " ", postalCode: "", city: "" };
	expect(parse(siteSchema, empty)).toEqual({
		issues: [
			["name", "Enter a name for the site"],
			["address", "Enter the street address"],
			["postalCode", "Enter the postal code"],
			["city", "Enter a city"],
		],
	});
});

test("the choices are from their lists, the contact details well-formed", () => {
	const wrong = {
		...form,
		id: "4",
		contactChannel: "fax",
		preferredDay: "someday",
		priority: "urgent",
		contactPhone: "call me",
		contactEmail: "jan@",
		slotStart: "7 uur",
	};
	expect(parse(siteSchema, wrong)).toEqual({
		issues: [
			["contactPhone", "Enter a valid phone number"],
			["contactEmail", "Enter a valid email address"],
			["contactChannel", "Choose one"],
			["preferredDay", "Choose one"],
			["slotStart", "Enter a valid time"],
			["priority", "Choose one"],
		],
	});
});

test("the contact's name and the access notes have a limit", () => {
	const long = { ...form, id: "4", contactName: "J".repeat(121), accessNotes: "N".repeat(501) };
	expect(parse(siteSchema, long)).toEqual({
		issues: [
			["contactName", "Use at most 120 characters"],
			["accessNotes", "Use at most 500 characters"],
		],
	});
	const longest = { ...form, id: "4", contactName: "J".repeat(120), accessNotes: "N".repeat(500) };
	expect(parse(siteSchema, longest)).toHaveProperty("value");
});

test("a time slot has both ends, the end after the start", () => {
	const slot = (slotStart: string, slotEnd: string) =>
		parse(siteSchema, { ...form, id: "4", slotStart, slotEnd });
	expect(slot("07:00", "")).toEqual({
		issues: [["slotEnd", "Enter both the start and the end of the time slot"]],
	});
	expect(slot("", "15:00")).toEqual({
		issues: [["slotEnd", "Enter both the start and the end of the time slot"]],
	});
	expect(slot("15:00", "07:00")).toEqual({
		issues: [["slotEnd", "The end comes after the start"]],
	});
	expect(slot("07:00", "07:00")).toEqual({
		issues: [["slotEnd", "The end comes after the start"]],
	});
	expect(slot("06:00", "14:00")).toHaveProperty("value.slotEnd", "14:00");
});

test("slotProblem says nothing of a slot that's complete or left out", () => {
	expect(slotProblem({ slotStart: null, slotEnd: null })).toBeNull();
	expect(slotProblem({ slotStart: "09:00", slotEnd: "17:00" })).toBeNull();
});
