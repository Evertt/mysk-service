/**
 * Keeps the translations complete: every message file is registered in the inlang project, and
 * every message exists in every language with the same variables. The registered files are the
 * core's (`messages/<locale>/<section>.json`) and the modules' (`src/modules/<id>/messages/…`),
 * which `scripts/modules.ts` lists in the settings.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { baseLocale, locales } from "#lib/paraglide/runtime.js";

const root = new URL("../../../../../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

/** A message as stored: a text, or a variant message (e.g. a plural) as an array of one object. */
type Message =
	| string
	| { declarations?: string[]; selectors?: string[]; match: Record<string, string> }[];

const settings = read("project.inlang/settings.json");
const patterns: string[] = settings["plugin.inlang.messageFormat"].pathPattern;

/** A message file (a section) from the inlang settings: `common` in `messages`, say. */
interface MessageFile {
	/** Where its language folders are, e.g. `messages` or `src/modules/contracts/messages`. */
	folder: string;
	/** The file's name, which starts the keys of its messages. */
	section: string;
}
const files: MessageFile[] = patterns.map((pattern) => {
	const match =
		/^\.\/((?:src\/modules\/[a-z][a-z0-9-]*\/)?messages)\/\{locale\}\/([\w-]+)\.json$/.exec(
			pattern,
		);
	if (!match) throw new Error(`Unexpected message file pattern: ${pattern}`);
	return { folder: match[1], section: match[2] };
});
const folders = [...new Set(files.map((file) => file.folder))];

const messages = (locale: string, { folder, section }: MessageFile): Record<string, Message> => {
	const { $schema, ...rest } = read(`${folder}/${locale}/${section}.json`);
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
	for (const folder of folders) {
		const registered = files.filter((file) => file.folder === folder).map((file) => file.section);
		for (const locale of locales) {
			const present = readdirSync(new URL(`${folder}/${locale}/`, root)).map((name) =>
				name.replace(/\.json$/, ""),
			);
			expect(present.toSorted(), `${folder}/${locale}`).toEqual(registered.toSorted());
		}
	}
});

test("message sections are unique, as their keys start with them", () => {
	const sections = files.map((file) => file.section);
	expect(sections.filter((section, i) => sections.indexOf(section) !== i)).toEqual([]);
});

test("the settings list the message files of the modules on disk, after the core's", () => {
	const modulesDir = new URL("src/modules/", root);
	const ids = existsSync(modulesDir)
		? readdirSync(modulesDir, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() && existsSync(new URL(`${entry.name}/module.ts`, modulesDir)),
				)
				.map((entry) => entry.name)
				.toSorted()
		: [];
	const expected = ids.flatMap((id) => {
		const folder = new URL(`${id}/messages/${baseLocale}/`, modulesDir);
		return existsSync(folder)
			? readdirSync(folder)
					.filter((name) => name.endsWith(".json"))
					.toSorted()
					.map((name) => `./src/modules/${id}/messages/{locale}/${name}`)
			: [];
	});
	const core = patterns.filter((pattern) => !pattern.startsWith("./src/modules/"));
	// If this fails, run `pnpm generate`: it rewrites the list.
	expect(patterns).toEqual([...core, ...expected]);
});

describe.each(files)("$folder/*/$section.json", (file) => {
	const { section } = file;
	const base = messages(baseLocale, file);

	test(`keys start with "${section}_" and are identifiers`, () => {
		const pattern = new RegExp(`^${section}_[a-z0-9_]+$`);
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
