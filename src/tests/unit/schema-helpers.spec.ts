/**
 * One way to validate a number, an id or an email address in a schema: the helpers of
 * `#lib/schema.ts` (`numberIn()`, `wholeIn()`, `hiddenInt()`, `year()`, `id()`, `recordId()`,
 * `email()`), never their valibot parts by hand (`v.pipe(v.number(), v.integer(), v.minValue(1))`).
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The parts the helpers are made of. */
const handBuilt =
	/\bv\.(?:minValue|maxValue|gtValue|ltValue|integer|finite|email)\(|\bv\.transform\(Number\)/g;

/** Files that may use them, with how often and why. */
const allowed: Record<string, { count: number; reason: string }> = {
	"src/modules/invoices/form/credit-note-schema.ts": {
		count: 1,
		reason: "at least a cent: a bound on `cents()`, once it's rounded",
	},
	"src/modules/partner-programme/form/wallet-schema.ts": {
		count: 1,
		reason: "at least a cent: a bound on `cents()`, once it's rounded",
	},
};

const files = globSync("src/**/*.{svelte,ts}", { cwd: root }).filter(
	(path) =>
		path !== "src/lib/schema.ts" &&
		!path.startsWith("src/tests/") &&
		!path.includes("/tests/") &&
		!/\.(?:spec|test)\.ts$/.test(path),
);

const uses = (path: string) => {
	const source = readFileSync(join(root, path), "utf8");
	return [...source.matchAll(handBuilt)].map(
		({ 0: part, index }) => `${path}:${source.slice(0, index).split("\n").length} ${part}`,
	);
};

test("numbers, ids and emails are validated with the helpers of #lib/schema.ts", () => {
	const offences = files.flatMap((path) => {
		const found = uses(path);
		return found.length === allowed[path]?.count ? [] : found;
	});
	expect(offences, "use numberIn(), wholeIn(), hiddenInt(), year(), id() or email()").toEqual([]);
});

test.each(Object.entries(allowed))("the exception for %s is still needed", (path) => {
	expect(uses(path)).not.toEqual([]);
});
