/**
 * A `$derived` holds one `await`. With two in one expression
 * (`$derived(await f(await g()))`), Svelte's compiled code restores the derived's context after the
 * inner one and keeps it while the outer one waits; a microtask that runs then (SvelteKit's
 * navigation, setting the page's data) runs inside the derived and is refused with
 * `state_unsafe_mutation`. Take the inner value in a `$derived` of its own.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The app's components and rune modules, but the kit's (`ui/`) and the tests. */
const sources = () =>
	readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				/\.(?:svelte|svelte\.ts)$/.test(file) &&
				!file.startsWith("src/lib/components/ui/") &&
				!file.startsWith("src/tests/"),
		);

/** The text of each `$derived(…)` / `$derived.by(…)` in `code`, with its line. */
function deriveds(code: string) {
	const found: { line: number; body: string }[] = [];
	for (const match of code.matchAll(/\$derived(?:\.by)?\(/g)) {
		let depth = 1;
		let end = match.index + match[0].length;
		while (end < code.length && depth) {
			if (code[end] === "(") depth++;
			else if (code[end] === ")") depth--;
			end++;
		}
		const body = code.slice(match.index + match[0].length, end - 1);
		found.push({ line: code.slice(0, match.index).split("\n").length, body });
	}
	return found;
}

test("a $derived holds one await", () => {
	const files = sources();
	expect(files.length).toBeGreaterThan(100);
	const offenders = files.flatMap((file) =>
		deriveds(readFileSync(join(root, file), "utf8"))
			.filter(({ body }) => (body.match(/\bawait\b/g) ?? []).length > 1)
			.map(({ line }) => `${file}:${line}`),
	);
	expect(offenders, "take the inner await in a $derived of its own").toEqual([]);
});
