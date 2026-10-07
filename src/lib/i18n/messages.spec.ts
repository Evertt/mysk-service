/**
 * Keeps the translations complete: every message file is registered in the inlang project, and
 * every message exists in every language with the same variables.
 */
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { baseLocale, locales } from "#lib/paraglide/runtime.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

/** A message as stored: a text, or a variant message (e.g. a plural) as an array of one object. */
type Message =
	| string
	| { declarations?: string[]; selectors?: string[]; match: Record<string, string> }[];

const settings = read("project.inlang/settings.json");
const patterns: string[] = settings["plugin.inlang.messageFormat"].pathPattern;
/** The message files (sections), from the inlang settings, e.g. `common`. */
const files = patterns.map(
	(pattern) => /^\.\/messages\/\{locale\}\/([\w-]+)\.json$/.exec(pattern)![1],
);

const messages = (locale: string, file: string): Record<string, Message> => {
	const { $schema, ...rest } = read(`messages/${locale}/${file}.json`);
	expect($schema).toBe("https://inlang.com/schema/inlang-message-format");
	return rest;
};

/** The variables a message takes: its `{placeholders}` and declared inputs, minus its locals. */
function variables(message: Message) {
	const texts = typeof message === "string" ? [message] : Object.values(message[0].match);
	const declarations = typeof message === "string" ? [] : (message[0].declarations ?? []);
	const locals = new Set(declarations.flatMap((d) => /^local (\w+)/.exec(d)?.[1] ?? []));
	const inputs = declarations.flatMap((d) => /^input (\w+)/.exec(d)?.[1] ?? []);
	const placeholders = texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, n]) => n));
	return [...new Set([...inputs, ...placeholders])].filter((name) => !locals.has(name)).toSorted();
}

test("every language has a folder with exactly the registered message files", () => {
	expect(settings.locales).toEqual([...locales]);
	for (const locale of locales) {
		const present = readdirSync(new URL(`messages/${locale}/`, root)).map((name) =>
			name.replace(/\.json$/, ""),
		);
		expect(present.toSorted(), locale).toEqual(files.toSorted());
	}
});

describe.each(files)("messages/*/%s.json", (file) => {
	const base = messages(baseLocale, file);

	test(`keys start with "${file}_" and are identifiers`, () => {
		const pattern = new RegExp(`^${file}_[a-z0-9_]+$`);
		expect(Object.keys(base).filter((key) => !pattern.test(key))).toEqual([]);
	});

	test.each(locales.filter((locale) => locale !== baseLocale))(
		"%s has the same keys, each with the same variables",
		(locale) => {
			const translated = messages(locale, file);
			expect(Object.keys(translated).toSorted()).toEqual(Object.keys(base).toSorted());
			for (const [key, message] of Object.entries(base)) {
				expect(variables(translated[key]), key).toEqual(variables(message));
			}
		},
	);

	test.each(locales)("%s has no empty messages", (locale) => {
		for (const [key, message] of Object.entries(messages(locale, file))) {
			const texts = typeof message === "string" ? [message] : Object.values(message[0].match);
			expect(
				texts.every((text) => text.trim() !== ""),
				key,
			).toBe(true);
		}
	});
});
