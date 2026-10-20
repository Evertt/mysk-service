/**
 * One way to ask whether a value is one of a list's: `isOneOf(values, value)` (`#lib/one-of.ts`),
 * which also narrows it to their type. Casting the list or the value to make `.includes()` take it
 * (`(xs as readonly string[]).includes(x)`, `xs.includes(x as X)`) says the same with a cast.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** A cast list's or a cast value's `.includes()`. */
const castIncludes =
	/\bas (?:readonly )?[\w<>[\]]+\[\]\)\s*\.includes\(|\.includes\([^()]* as \w+\)/;

const files = globSync("src/**/*.{svelte,ts}", { cwd: root }).filter(
	(path) => path !== "src/lib/one-of.ts" && path !== "src/tests/unit/is-one-of.spec.ts",
);

test("a list's members are asked for with isOneOf(), not a cast .includes()", () => {
	const offences = files.flatMap((path) => {
		const source = readFileSync(join(root, path), "utf8");
		return [...source.matchAll(new RegExp(castIncludes, "g"))].map(
			({ index }) => `${path}:${source.slice(0, index).split("\n").length}`,
		);
	});
	expect(offences, "use isOneOf(values, value) from #lib/one-of.ts").toEqual([]);
});

test("finds a cast list's and a cast value's .includes()", () => {
	expect("(kinds as readonly string[]).includes(x)").toMatch(castIncludes);
	expect("(roles as string[]).includes(role)").toMatch(castIncludes);
	expect("kinds.includes(error.kind as ErrorKind)").toMatch(castIncludes);
	expect("isOneOf(kinds, x) && kinds.includes(y)").not.toMatch(castIncludes);
});
