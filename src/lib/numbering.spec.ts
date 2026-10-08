import { describe, expect, test } from "vite-plus/test";

import {
	formatCode,
	type NumberFormat,
	type NumberKind,
	numberFormats,
	sequenceStart,
} from "./numbering.ts";

const kinds = Object.keys(numberFormats) as NumberKind[];

describe("formatCode", () => {
	test("pads the sequence after the prefix", () => {
		expect(formatCode("customer", 1)).toBe("CUST-0001");
		expect(formatCode("material", 42)).toBe("MAT-0042");
	});

	test("puts the year of yearly numbers between the prefix and the sequence", () => {
		expect(formatCode("order", 1, 2026)).toBe("ORD-2026-00001");
		expect(formatCode("invoice", 1234, 2027)).toBe("INV-2027-01234");
	});

	test("uses this year by default, and ignores the year of the others", () => {
		expect(formatCode("order", 3)).toBe(`ORD-${new Date().getFullYear()}-00003`);
		expect(formatCode("customer", 3, 1999)).toBe("CUST-0003");
	});

	test("keeps counting past the padding", () => {
		expect(formatCode("invoice", 123456, 2030)).toBe("INV-2030-123456");
		expect(formatCode("customer", 12345)).toBe("CUST-12345");
	});
});

describe("sequenceStart", () => {
	test("is where the sequence starts, counting from 1 as SQL's substr does", () => {
		expect(sequenceStart("customer")).toBe(6);
		expect(sequenceStart("material")).toBe(5);
		expect(sequenceStart("order")).toBe(10);
		expect(sequenceStart("invoice")).toBe(10);
	});

	test.each(kinds)("agrees with the format of %s", (kind) => {
		const { digits } = numberFormats[kind];
		expect(formatCode(kind, 42, 2026).slice(sequenceStart(kind) - 1)).toBe(
			"42".padStart(digits, "0"),
		);
	});
});

describe("a format of a module's own", () => {
	const format: NumberFormat = { prefix: "WID-", digits: 3, yearly: true };

	test("is used like a kind", () => {
		expect(formatCode(format, 7, 2027)).toBe("WID-2027-007");
		expect(sequenceStart(format)).toBe(10);
		expect(formatCode(format, 42, 2026).slice(sequenceStart(format) - 1)).toBe("042");
	});
});
