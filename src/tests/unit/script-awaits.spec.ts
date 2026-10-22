/**
 * A component's script awaits in one step. Svelte runs the top-level `$derived(await …)`s of a
 * `<script>` one after another (each waits for the one before it), so two independent queries there
 * load in sequence. Take them together in one: `const [a, b] = $derived(await Promise.all([getA(),
 * getB()]))`. A later await that needs an earlier one's value waits for it anyway, so it may stay.
 * The template's awaits already run in parallel.
 *
 * The check: a top-level awaited `$derived` (or plain `await`) after the first must name something
 * an earlier one declared, or a `$derived` or function made from one; otherwise it's a waterfall.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Components whose independent awaits stay in sequence, with the reason. */
const allowed: Record<string, string> = {
	"src/modules/schedule/routes/(app)/+page.svelte":
		"`month` and `schedule` each load in their own view only; in the other, theirs is `undefined` at once, so no query waits for another",
};

/** The app's components, but the kit's (`ui/`) and the tests. */
const components = () =>
	readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				file.endsWith(".svelte") &&
				!file.startsWith("src/lib/components/ui/") &&
				!file.startsWith("src/tests/"),
		);

/**
 * A component's instance script (not `<script module>`), with the rest of the file blanked, so its
 * lines are the file's.
 */
function instanceScript(source: string) {
	const script = [...source.matchAll(/(<script\b([^>]*)>)([\s\S]*?)<\/script>/g)].find(
		(match) => !/\bmodule\b/.test(match[2] ?? ""),
	);
	if (!script) return "";
	return (
		source.slice(0, script.index + (script[1] ?? "").length).replace(/[^\n]/g, " ") + script[3]
	);
}

/** `code` with its comments and the contents of its strings blanked (newlines kept), so nothing in them counts. */
function blanked(code: string) {
	return code.replace(
		/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
		(text) =>
			text.startsWith("/")
				? text.replace(/[^\n]/g, " ")
				: text[0] + text.slice(1, -1).replace(/[^\n]/g, " ") + text[0],
	);
}

const identifiers = (text: string) => new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []);

/**
 * The script's top-level statements, in order: the names each declares, the code it runs, whether
 * it awaits (an awaited `$derived`, or a plain `await`), and its line. A statement ends at a top-level `;`, or at a `}` that
 * ends a line (a function's declaration).
 */
function statements(script: string) {
	const code = blanked(script);
	const found: { names: Set<string>; init: string; awaits: boolean; line: number }[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index <= code.length; index++) {
		const char = code[index];
		if (char === "(" || char === "[" || char === "{") depth++;
		else if (char === ")" || char === "]" || char === "}") depth--;
		const ends =
			index === code.length ||
			(depth === 0 && (char === ";" || (char === "}" && /^[ \t]*\n/.test(code.slice(index + 1)))));
		if (!ends) continue;
		const text = code.slice(start, index + 1);
		const offset = start + (text.length - text.trimStart().length);
		start = index + 1;
		const declaration = /^\s*(?:export\s+)?(?:const|let|var)\s+([^=]+?)\s*=(?!>)\s*([\s\S]*)$/.exec(
			text,
		);
		const fn = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(text);
		const awaited = /^\s*await\b/.test(text);
		if (!declaration && !fn && !awaited) continue;
		// The declared names: `a`, or a destructuring's (`[a, b]`, `{ a, b: c }` gives `c`), without
		// a type annotation.
		const target = declaration?.[1] ?? fn?.[1] ?? "";
		const pattern = /^[[{]/.test(target) ? target.replace(/[\w$]+\s*:/g, "") : target.split(":")[0];
		const init = declaration?.[2] ?? text;
		found.push({
			names: identifiers(pattern ?? ""),
			init,
			awaits: /^(?:await\b|\$derived\b[\s\S]*\bawait\b)/.test(init.trimStart()),
			line: script.slice(0, offset).split("\n").length,
		});
	}
	return found;
}

/**
 * The lines of a script's awaits after the first that don't depend on an earlier one, directly or
 * through a `$derived` or function made from it.
 */
export function waterfalls(script: string) {
	const tainted = new Set<string>();
	let seen = false;
	const lines: number[] = [];
	for (const { names, init, awaits, line } of statements(script)) {
		const used = identifiers(init);
		const depends = [...tainted].some((name) => used.has(name));
		if (awaits && seen && !depends) lines.push(line);
		if (awaits || depends) for (const name of names) tainted.add(name);
		seen ||= awaits;
	}
	return lines;
}

test("a component's script takes its independent awaits in one step", () => {
	const files = components();
	expect(files.length).toBeGreaterThan(100);
	const offenders = files.flatMap((file) =>
		file in allowed
			? []
			: waterfalls(instanceScript(readFileSync(join(root, file), "utf8"))).map(
					(line) => `${file}:${line}`,
				),
	);
	expect(
		offenders,
		"take independent awaits together: $derived(await Promise.all([…])) (docs/agents/kit.md, Loading data)",
	).toEqual([]);
});

test("every allowed component still has a waterfall", () => {
	const stale = Object.keys(allowed).filter(
		(file) => waterfalls(instanceScript(readFileSync(join(root, file), "utf8"))).length === 0,
	);
	expect(stale, "drop these from `allowed`").toEqual([]);
});

test("finds independent awaits, not dependent ones", () => {
	expect(
		waterfalls(`
	const a = $derived(await getA());
	const b = $derived(await getB());`),
	).toEqual([3]);
	expect(
		waterfalls(`
	const [a, b] = $derived(await Promise.all([getA(), getB()]));
	const c = $derived(await getC(a.id));`),
	).toEqual([]);
	// A dependency through a plain $derived counts.
	expect(
		waterfalls(`
	const a = $derived(await getA());
	const id = $derived(a.id);
	const { b } = $derived(await getB(id));`),
	).toEqual([]);
	// A derived of props or of nothing awaited doesn't.
	expect(
		waterfalls(`
	let { code } = $props();
	const key = $derived(code.trim());
	const a = $derived(await getA(key));
	const b = $derived(await getB(key));`),
	).toEqual([5]);
	// Awaits inside a function, or in a string, aren't the script's.
	expect(
		waterfalls(`
	const a = $derived(await getA());
	function load() {
		const b = $derived(await getB());
	}
	const label = $derived("{ await }");`),
	).toEqual([]);
	// A dependency through a function counts; a plain top-level await is one too.
	expect(
		waterfalls(`
	const a = $derived(await getA());
	const load = async () => (await getB(a)).rows;
	const b = $derived(await load());
	const [c] = await Promise.all([getC()]);`),
	).toEqual([5]);
});

test("reports the component's own lines, from its instance script", () => {
	const component = `<script module>
	export const x = $derived(await getX());
</script>

<script lang="ts">
	const a = $derived(await getA());
	const b = $derived(await getB());
</script>

{await getC()}`;
	expect(waterfalls(instanceScript(component))).toEqual([7]);
});
