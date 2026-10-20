/**
 * One way to keep a form's rows that can be added and removed: `lineItems()`, with `withoutValue()`
 * for the inputs' attributes (`#lib/components/form/line-items.svelte.ts`). So no component keys
 * its rows with `crypto.randomUUID()` or strips a field's value itself.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The lines of `source` that key a row or strip a field's value by hand. */
export function handMadeRows(source: string) {
	return source
		.split("\n")
		.flatMap((line, index) =>
			/\bkey:\s*crypto\.randomUUID\(\)|\bfunction withoutValue\b/.test(line) ? [index + 1] : [],
		);
}

test("a form's rows are lineItems()", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				/\.svelte(\.ts)?$/.test(file) &&
				!file.startsWith("src/tests/") &&
				file !== "src/lib/components/form/line-items.svelte.ts",
		)
		.flatMap((file) =>
			handMadeRows(readFileSync(join(root, file), "utf8")).map(
				(line) => `${file}:${line} (use lineItems() and withoutValue())`,
			),
		);
	expect(found).toEqual([]);
});

test("finds a hand-keyed row and a hand-made withoutValue()", () => {
	expect(handMadeRows("lines.push({ key: crypto.randomUUID(), quantity: 1 });")).toEqual([1]);
	expect(handMadeRows("\nfunction withoutValue<T>({ value, ...rest }: T) {")).toEqual([2]);
	expect(handMadeRows("const id = crypto.randomUUID();")).toEqual([]);
});
