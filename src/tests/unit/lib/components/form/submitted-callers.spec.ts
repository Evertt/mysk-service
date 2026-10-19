/**
 * A form's `enhance` callback that goes on after `submitted()` (a success toast, a reset, reading
 * `form.result`) acts on its answer: a submission that threw was toasted and is false, so the
 * success steps mustn't run. Checked on the source: an `await submitted(…)` whose answer is
 * dropped ends its callback.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../../../../..");

/** The lines of `source` with a dropped `await submitted(…)` that more code follows. */
export function goesOnAfterDroppedAnswer(source: string) {
	const lines = source.split("\n");
	return lines.flatMap((line, index) => {
		if (!/^\s*await submitted\(/.test(line)) return [];
		// The rest of the statement, then the next line that isn't blank.
		let end = index;
		while (end < lines.length - 1 && !/\);\s*$/.test(lines[end])) end++;
		const next = lines.slice(end + 1).find((rest) => rest.trim() !== "");
		return next !== undefined && !/^\s*}\)/.test(next) ? [index + 1] : [];
	});
}

test("no form goes on after dropping submitted()'s answer", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".svelte"))
		.flatMap((file) =>
			goesOnAfterDroppedAnswer(readFileSync(join(root, "src", file), "utf8")).map(
				(line) => `src/${file}:${line}`,
			),
		);
	expect(found).toEqual([]);
});

test("finds a callback that goes on, not one that ends", () => {
	const goesOn = "async ({ submit }) => {\n\tawait submitted(submit);\n\ttoast.success(saved);\n})";
	const ends = "async ({ submit }) => {\n\tawait submitted(submit);\n})";
	const acts =
		"async ({ submit }) => {\n\tif (!(await submitted(submit))) return;\n\ttoast.success(saved);\n})";
	expect(goesOnAfterDroppedAnswer(goesOn)).toEqual([2]);
	expect(goesOnAfterDroppedAnswer(ends)).toEqual([]);
	expect(goesOnAfterDroppedAnswer(acts)).toEqual([]);
});
