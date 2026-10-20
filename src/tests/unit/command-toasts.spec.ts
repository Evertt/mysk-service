/**
 * One way to say a command failed: `ran(cmd(), fallback)` (a form: `submitted(submit)`), from
 * `#lib/components/form/submitted.ts`. It toasts the error's own message (`errorMessage()`) or the
 * fallback, and answers whether the command went through. So no `catch` toasts an error itself, and
 * `errorMessage()` is only called by those helpers.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Where `errorMessage()` and the toast belong. */
const helpers = ["src/lib/components/form/submitted.ts", "src/lib/errors/messages.ts"];

/** A `catch` (block or `.catch(…)`) that toasts an error within its first lines. */
const catchThatToasts = /\bcatch\b[^\n]*\n?(?:[^\n]*\n){0,3}?[^\n]*toast\.error\(/g;

/** The lines of `source` with a hand-made command toast, and what they do. */
export function handMadeToasts(source: string) {
	const lineOf = (index: number) => source.slice(0, index).split("\n").length;
	return [
		...[...source.matchAll(catchThatToasts)].map((found) => `${lineOf(found.index)}: catch`),
		...[...source.matchAll(/\berrorMessage\(/g)].map(
			(found) => `${lineOf(found.index)}: errorMessage`,
		),
	];
}

test("commands say they failed with ran(), not a catch of their own", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				/\.(svelte|ts)$/.test(file) && !file.startsWith("src/tests/") && !helpers.includes(file),
		)
		.flatMap((file) =>
			handMadeToasts(readFileSync(join(root, file), "utf8")).map(
				(what) => `${file}:${what} (use ran(cmd(), fallback))`,
			),
		);
	expect(found).toEqual([]);
});

test("finds a catch that toasts, and a hand-made error message", () => {
	const block =
		"try {\n\tawait go();\n} catch (error) {\n\ttoast.error(errorMessage(error, x));\n}";
	expect(handMadeToasts(block)).toEqual(["3: catch", "4: errorMessage"]);
	const chained = "go().catch(() => toast.error(m.failed()));";
	expect(handMadeToasts(chained)).toEqual(["1: catch"]);
	expect(handMadeToasts("if (await ran(go(), m.failed())) toast.success(m.done());")).toEqual([]);
	expect(handMadeToasts("if (failed) toast.error(m.too_large());")).toEqual([]);
});
