import { describe, expect, test } from "vite-plus/test";

import { formatCents, formatDate, humanize } from "./format.ts";

describe("formatCents", () => {
	test("shows euros with two decimals and thousands separators", () => {
		expect(formatCents(123456)).toBe("€1,234.56");
		expect(formatCents(100_000_000)).toBe("€1,000,000.00");
	});

	test("keeps the cents of small amounts", () => {
		expect(formatCents(0)).toBe("€0.00");
		expect(formatCents(5)).toBe("€0.05");
	});

	test("puts the minus sign before the euro sign", () => {
		expect(formatCents(-1250)).toBe("-€12.50");
	});
});

describe("formatDate", () => {
	test("shows the day, the short month and the year", () => {
		expect(formatDate(new Date(2026, 9, 20))).toBe("20 Oct 2026");
	});

	test("shows the local day, also late in the evening", () => {
		expect(formatDate(new Date(2026, 0, 1, 23, 59))).toBe("1 Jan 2026");
	});
});

describe("humanize", () => {
	test("turns underscores into spaces and capitalises the first word only", () => {
		expect(humanize("out_of_service")).toBe("Out of service");
		expect(humanize("in_progress")).toBe("In progress");
	});

	test("leaves a single word capitalised", () => {
		expect(humanize("operational")).toBe("Operational");
	});

	test("leaves an empty value empty", () => {
		expect(humanize("")).toBe("");
	});
});
