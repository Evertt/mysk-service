/**
 * The shape of the wiki's messages (`messages/{en,nl}/wiki.json`), which hold prose with code in
 * it: a text with code puts the code between backticks (`<InlineCode>` shows it), so every message
 * has an even number of backticks, no braces inside code (the message format reads `{…}` as an
 * input, and the call would pass nothing for it: a step read `recordActivity(tx, undefined)`), and
 * the same code in both languages. A translator moves code, never changes it.
 */
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

const read = (locale: string): Record<string, string> =>
	Object.fromEntries(
		Object.entries(
			JSON.parse(
				readFileSync(new URL(`../../../../messages/${locale}/wiki.json`, import.meta.url), "utf8"),
			) as Record<string, string>,
		).filter(([key]) => key !== "$schema"),
	);

const [en, nl] = [read("en"), read("nl")];

/** The code spans of a message: its parts between backticks. */
const codeOf = (text: string) => text.split("`").filter((_, index) => index % 2 === 1);

/** The inputs of a message: its `{names}`. */
const inputsOf = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).toSorted();

describe.each([
	["en", en],
	["nl", nl],
] as const)("the wiki's messages in %s", (_, messages) => {
	test("every message is a plain text with its code in pairs of backticks", () => {
		for (const [key, text] of Object.entries(messages)) {
			expect(typeof text, key).toBe("string");
			expect(text.split("`").length % 2, `${key} has an odd number of backticks`).toBe(1);
		}
	});

	test("no code holds braces, which would read as an input the call doesn't pass", () => {
		for (const [key, text] of Object.entries(messages)) {
			for (const code of codeOf(text)) {
				expect(code, `${key}: ${code}`).not.toMatch(/[{}]/);
			}
		}
	});

	test("every brace outside code is a whole {input}", () => {
		for (const [key, text] of Object.entries(messages)) {
			const outside = text
				.split("`")
				.filter((_, index) => index % 2 === 0)
				.join("");
			expect(outside.replace(/\{\w+\}/g, ""), key).not.toMatch(/[{}]/);
		}
	});
});

describe("the two languages", () => {
	test("have the same keys", () => {
		expect(Object.keys(nl).toSorted()).toEqual(Object.keys(en).toSorted());
	});

	test("have the same code, in the same order", () => {
		for (const key of Object.keys(en)) {
			expect(codeOf(nl[key]), key).toEqual(codeOf(en[key]));
		}
	});

	test("have the same inputs", () => {
		for (const key of Object.keys(en)) {
			expect(inputsOf(nl[key]), key).toEqual(inputsOf(en[key]));
		}
	});
});
