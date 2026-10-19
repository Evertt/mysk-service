/**
 * A form's `enhance` callback that goes on after `submitted()` (a success toast, a reset, reading
 * `form.result`) acts on its answer: a submission that threw was toasted and is false, so the
 * success steps mustn't run. Checked on the source: every `await submitted(…)` either has its
 * answer used (in a condition, assigned, returned) or is the last statement of its callback.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../../..");

/** Where the parenthesis opened at `open` in `source` closes. */
function closing(source: string, open: number) {
	let depth = 0;
	for (let index = open; index < source.length; index++) {
		if (source[index] === "(") depth++;
		if (source[index] === ")" && --depth === 0) return index;
	}
	return source.length;
}

/** The lines of `source` with an `await submitted(…)` whose answer is dropped while code follows. */
export function goesOnAfterDroppedAnswer(source: string) {
	const found: number[] = [];
	for (const call of source.matchAll(/await\s+submitted\(/g)) {
		const before = source.slice(0, call.index).trimEnd();
		const after = source.slice(closing(source, call.index + call[0].length - 1) + 1);
		const used = /(\(|!|=|\breturn|\bvoid)$/.test(before) && !/^\s*\.then\b/.test(after);
		// Dropped: fine only as its callback's last statement.
		const last = /^\s*;?\s*}/.test(after);
		if (!used && !last) found.push(source.slice(0, call.index).split("\n").length);
	}
	return found;
}

test("no form goes on after dropping submitted()'s answer", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.filter((file) => /\.svelte(\.ts)?$/.test(file))
		.flatMap((file) =>
			goesOnAfterDroppedAnswer(readFileSync(join(root, "src", file), "utf8")).map(
				(line) => `src/${file}:${line}`,
			),
		);
	expect(found).toEqual([]);
});

test("finds a callback that goes on after dropping the answer, in any layout", () => {
	const goesOn = "async ({ submit }) => {\n\tawait submitted(submit);\n\ttoast.success(saved);\n}";
	const sameLine = "async ({ submit }) => {\n\tawait submitted(submit); toast.success(saved);\n}";
	const then =
		"async ({ submit }) => {\n\tawait submitted(submit).then(() => toast.success(saved));\n}";
	expect(goesOnAfterDroppedAnswer(goesOn)).toEqual([2]);
	expect(goesOnAfterDroppedAnswer(sameLine)).toEqual([2]);
	expect(goesOnAfterDroppedAnswer(then)).toEqual([2]);
});

test("lets a callback that uses the answer, or ends with the call, through", () => {
	const ends = "async ({ submit }) => {\n\tawait submitted(submit);\n}";
	const acts =
		"async ({ submit }) => {\n\tif (!(await submitted(submit))) return;\n\ttoast.success(saved);\n}";
	const wrapped =
		"async ({ submit }) => {\n\tif (\n\t\tawait submitted(() =>\n\t\t\tsubmit().updates(x),\n\t\t)\n\t) {\n\t\tdone();\n\t}\n\tmore();\n}";
	const assigned =
		"async ({ submit }) => {\n\tconst ok = await submitted(submit);\n\tif (ok) done();\n}";
	expect(goesOnAfterDroppedAnswer(ends)).toEqual([]);
	expect(goesOnAfterDroppedAnswer(acts)).toEqual([]);
	expect(goesOnAfterDroppedAnswer(wrapped)).toEqual([]);
	expect(goesOnAfterDroppedAnswer(assigned)).toEqual([]);
});
