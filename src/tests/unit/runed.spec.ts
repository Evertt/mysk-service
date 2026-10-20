/**
 * Reactive utilities come from runed (`runed`), not by hand: a debounce is `useDebounce` (or
 * `Debounced` for a value), a debounced search `resource()` on a `Debounced` term, idling
 * `IsIdle`; a context is Svelte's `createContext()`. So a component or rune module refuses a
 * hand-made debounce (`clearTimeout(` beside `setTimeout(`), and a `Symbol` context key, outside
 * the few timers below that are no debounce (or not yet runed's), with why.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Files that clear a timer they set, with why. */
const timers: Record<string, string> = {
	"src/lib/components/activity/live-activity.svelte.ts":
		"a throttle that waits for the running refresh and for the tab to be shown, no debounce",
	"src/lib/components/simulation/simulation-bar.svelte":
		"the first tick before an interval's, cleared with it",
	"src/lib/components/data-table/column-widths.svelte.ts":
		"a timeout after an animation frame, cancelled with it",
	"src/lib/components/record-link/record-link.svelte":
		"the pointer's rest and away timers, in an attachment that lives with the link",
	"src/lib/components/data-table/url-sync.svelte.ts":
		"the search's pause, which skips writing once a navigation elsewhere is under way: a timer per effect run, cleared with it; `useDebounce` outlives the effect, so it would need a `cancel()` and a caught rejection",
	"src/lib/components/data-table/scroll-position.svelte.ts":
		"the resize and scroll pauses, which must not fire once the table is gone: timers cleared with their effect; `useDebounce` would outlive it",
};

/** The app's components and modules, but the kit's (`ui/`) and the tests. */
const sources = () =>
	readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				/\.(?:svelte|ts)$/.test(file) &&
				!file.startsWith("src/lib/components/ui/") &&
				!file.startsWith("src/tests/"),
		)
		.map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));

const reactive = (file: string) => file.endsWith(".svelte") || file.endsWith(".svelte.ts");

/** The lines of `source` that match `pattern`. */
const lines = (source: string, pattern: RegExp) =>
	source.split("\n").flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));

/** The lines of a hand-made debounce: clearing a timeout, in a file that sets one. */
const handMadeDebounce = (source: string) =>
	/\bsetTimeout\(/.test(source) ? lines(source, /\bclearTimeout\(/) : [];

test("debounces are runed's useDebounce or Debounced", () => {
	const found = sources()
		.filter(({ file }) => reactive(file) && !(file in timers))
		.flatMap(({ file, source }) => handMadeDebounce(source).map((line) => `${file}:${line}`));
	expect(found, "debounce with runed's useDebounce (a value: Debounced)").toEqual([]);
});

test("the allowed timers are still there", () => {
	for (const file of Object.keys(timers)) {
		expect(handMadeDebounce(readFileSync(join(root, file), "utf8")), file).not.toEqual([]);
	}
});

test("contexts are made with createContext()", () => {
	const found = sources().flatMap(({ file, source }) =>
		/\b(?:set|get)Context\b/.test(source)
			? lines(source, /\bSymbol\(/).map((line) => `${file}:${line}`)
			: [],
	);
	expect(found, "make the context with Svelte's createContext()").toEqual([]);
});

test("finds a hand-made debounce", () => {
	expect(handMadeDebounce("clearTimeout(timer);\ntimer = setTimeout(run, 300);")).toEqual([1]);
	expect(handMadeDebounce("const first = setTimeout(tick, 100);")).toEqual([]);
	expect(handMadeDebounce("const search = useDebounce(run, 300);")).toEqual([]);
});
