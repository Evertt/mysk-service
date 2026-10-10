/**
 * One rule for import extensions: a file is imported by its real extension, so `.ts` for
 * TypeScript (`allowImportingTsExtensions` is on, and plain Node, which runs the seed, `org:create`
 * and `scripts/modules.ts`, needs it), `.svelte.ts` for rune modules, `.svelte` for components, and
 * `.js` only for real JavaScript (paraglide's generated files). Never `./x.js` for an `x.ts`, and
 * never `./x` without an extension, and no folder imported as `#lib/x` (a barrel is named
 * `#lib/x/index.ts`: no `imports` entry maps a folder).
 *
 * Oxlint's `import/extensions` only checks that an extension is there, not that it's the file's
 * own, so this reads the specifiers (`from "…"`, `import("…")`, `vi.mock("…")`, …) of relative and
 * `#lib/`, `#modules/` and `#e2e/` imports and looks at what is on disk. What points at nothing is
 * left to the type check. The `#ui/<name>` imports are a package.json `imports` pattern that adds
 * `/index.ts` itself, and `./$types` is Kit's.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "..");

interface SourceFile {
	/** Relative to the project root, with `/`. */
	path: string;
	source: string;
}

const aliases: Record<string, string> = {
	"#lib/": "src/lib/",
	"#modules/": "src/modules/",
	"#e2e/": "e2e/",
};

/** Where a specifier written in the file at `path` points, from the project root. */
function target(specifier: string, path: string): string | undefined {
	if (specifier.startsWith(".")) return posix.join(posix.dirname(path), specifier);
	for (const [alias, folder] of Object.entries(aliases)) {
		if (specifier.startsWith(alias)) return folder + specifier.slice(alias.length);
	}
	return undefined;
}

/** The same file with the extension it really has, if `specifier` has another one. */
export function realSpecifier(
	specifier: string,
	path: string,
	exists: (file: string) => boolean,
): string | undefined {
	const file = target(specifier, path);
	if (!file || /[$`{}]/.test(specifier) || exists(file)) return undefined;
	// What the specifier would be with the extension of a file that is there: `.ts` for `.js`
	// (also `.svelte.ts` for `.svelte.js`), or an extension where there is none.
	const guesses = specifier.endsWith(".js")
		? [specifier.slice(0, -".js".length) + ".ts"]
		: /\.(?:ts|svelte)$/.test(specifier)
			? []
			: [".ts", ".svelte.ts", ".svelte", ".js", "/index.ts"].map((ending) => specifier + ending);
	return guesses.find((guess) => exists(target(guess, path)!));
}

const specifierAfter =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|unmock|importActual)\s*\(\s*)(["'])([^"'\n]+)\1/g;

/** The imports in `files` that don't name the file by its real extension, with where. */
export function wrongExtensions(files: SourceFile[], exists: (file: string) => boolean): string[] {
	return files.flatMap(({ path, source }) =>
		[...source.matchAll(specifierAfter)].flatMap((match) => {
			const specifier = match[2];
			const real = realSpecifier(specifier, path, exists);
			if (!real) return [];
			const line = source.slice(0, match.index).split("\n").length;
			return [`${path}:${line} imports "${specifier}", the file is "${real}"`];
		}),
	);
}

describe("the check", () => {
	const present = new Set([
		"src/lib/x.ts",
		"src/lib/rune.svelte.ts",
		"src/lib/card.svelte",
		"src/lib/paraglide/runtime.js",
		"src/lib/server/db/schema.ts",
		"src/lib/folder/index.ts",
	]);
	const exists = (file: string) => present.has(file);
	const files: SourceFile[] = [
		{
			path: "src/lib/a.ts",
			source: [
				`import { x } from "./x.js";`,
				`import { x } from "./x.ts";`,
				`import { r } from "./rune.svelte.js";`,
				`import { r } from "./rune.svelte.ts";`,
				`import Card from "./card.svelte";`,
				`export { x } from "#lib/x.js";`,
				`import { run } from "./paraglide/runtime.js";`,
				`const c = await import("./card");`,
				`vi.mock("./x.js", () => ({}));`,
				`import { gone } from "./gone.js";`,
				`import type { PageProps } from "./$types";`,
				`import "./x";`,
				`import { f } from "#lib/folder";`,
			].join("\n"),
		},
		{ path: "src/routes/b.ts", source: `import { schema } from "../lib/server/db/schema";` },
	];

	test("finds the imports whose extension isn't the file's, and where", () => {
		expect(wrongExtensions(files, exists)).toEqual([
			`src/lib/a.ts:1 imports "./x.js", the file is "./x.ts"`,
			`src/lib/a.ts:3 imports "./rune.svelte.js", the file is "./rune.svelte.ts"`,
			`src/lib/a.ts:6 imports "#lib/x.js", the file is "#lib/x.ts"`,
			`src/lib/a.ts:8 imports "./card", the file is "./card.svelte"`,
			`src/lib/a.ts:9 imports "./x.js", the file is "./x.ts"`,
			`src/lib/a.ts:12 imports "./x", the file is "./x.ts"`,
			`src/lib/a.ts:13 imports "#lib/folder", the file is "#lib/folder/index.ts"`,
			`src/routes/b.ts:1 imports "../lib/server/db/schema", the file is "../lib/server/db/schema.ts"`,
		]);
	});
});

/** The files of the project that are checked in, leaving out what's installed or built. */
function sourceFiles(): SourceFile[] {
	const skip = /(?:^|\/)(?:node_modules|\.svelte-kit|paraglide|build)(?:\/|$)/;
	const files: SourceFile[] = [];
	for (const folder of ["src", "e2e", "scripts"]) {
		for (const entry of readdirSync(join(root, folder), { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(?:ts|js|svelte)$/.test(entry.name)) continue;
			const path = relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
			if (skip.test(path)) continue;
			files.push({ path, source: readFileSync(join(root, path), "utf8") });
		}
	}
	for (const name of readdirSync(root)) {
		if (/\.(?:ts|js)$/.test(name))
			files.push({ path: name, source: readFileSync(join(root, name), "utf8") });
	}
	return files;
}

describe("the project", () => {
	test("imports every file by its real extension", () => {
		const exists = (file: string) =>
			existsSync(join(root, file)) && statSync(join(root, file)).isFile();
		expect(wrongExtensions(sourceFiles(), exists)).toEqual([]);
	});
});
