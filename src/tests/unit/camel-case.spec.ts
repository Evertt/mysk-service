/**
 * One way to put a kebab-case or dotted name in camelCase: `camelCase()` (`#lib/camel-case.ts`),
 * which the module generator imports too. So no other code replaces a `-` and the letter after it
 * with that letter in upper case.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { camelCase } from "#lib/camel-case.ts";

const root = join(import.meta.dirname, "../../..");

/** The lines of `source` that camel-case a name by hand: a `replace()` of `-(…)` with `toUpperCase()`. */
const handWritten = (source: string) =>
	source
		.split("\n")
		.flatMap((line, index) =>
			/\.replace\(\/[^/]*-[^/]*\(/.test(line) && /toUpperCase\(\)/.test(line) ? [index + 1] : [],
		);

test("names are camel-cased with camelCase()", () => {
	const found = ["src", "scripts"]
		.flatMap((dir) =>
			readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).map(
				(file) => `${dir}/${file}`,
			),
		)
		.filter(
			(file) =>
				/\.(?:svelte|ts)$/.test(file) &&
				file !== "src/lib/camel-case.ts" &&
				!file.includes("/paraglide/") &&
				!/(^|\/)tests\/|\.spec\.ts$/.test(file),
		)
		.flatMap((file) =>
			handWritten(readFileSync(join(root, file), "utf8")).map(
				(line) => `${file}:${line}: use camelCase() (#lib/camel-case.ts)`,
			),
		);
	expect(found).toEqual([]);
});

test("camel-cases kebab-case and dotted names", () => {
	expect(camelCase("partner-programme")).toBe("partnerProgramme");
	expect(camelCase("materials.orders.form")).toBe("materialsOrdersForm");
	expect(camelCase("materials")).toBe("materials");
	expect(handWritten(`id.replace(/-(\\w)/g, (_, c) => c.toUpperCase())`)).toEqual([1]);
	expect(handWritten(`camelCase(id)`)).toEqual([]);
});
