/**
 * Makes the shadcn-svelte components in `src/lib/components/ui` themeable, and lists their parts
 * for the theme types. Run it after adding or updating components: `pnpm themes:sync`.
 *
 * For every element with a `data-slot`, the theme's classes for that slot are merged in between
 * the component's own classes and the consumer's `class`:
 *
 *   class={cn("…shadcn classes…", className)}
 *   → class={cn("…shadcn classes…", theme.classes("card-header"), className)}
 *
 * Elements that are our own components (`<Input>`, `<Dialog.Content>`, …) are skipped, since those
 * theme themselves. Already-themed elements are left alone, so the script can be re-run. Classes
 * per variant or size (e.g. `theme.classes("button", { variant, size })`) are added by hand once.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const uiDir = "src/lib/components/ui";
const slotsFile = "src/lib/themes/slots.ts";

const files = readdirSync(uiDir, { recursive: true, encoding: "utf8" })
	.filter((file) => file.endsWith(".svelte"))
	.map((file) => join(uiDir, file))
	.sort();

/** Index of the bracket that closes the one at `start`, skipping strings and nested brackets. */
function matchBracket(source: string, start: number): number {
	const open = source[start];
	const close = { "(": ")", "{": "}", "[": "]" }[open]!;
	let depth = 0;
	for (let i = start; i < source.length; i++) {
		const char = source[i];
		if (char === '"' || char === "'" || char === "`") {
			i = source.indexOf(char, i + 1);
			continue;
		}
		if (char === open) depth++;
		else if (char === close && --depth === 0) return i;
	}
	throw new Error(`Unbalanced ${open} at ${start}`);
}

/** Index of the `>` that ends the tag starting at `start`. */
function tagEnd(source: string, start: number): number {
	for (let i = start; i < source.length; i++) {
		const char = source[i];
		if (char === "{") i = matchBracket(source, i);
		else if (char === '"') i = source.indexOf('"', i + 1);
		else if (char === ">") return i;
	}
	throw new Error(`Unterminated tag at ${start}`);
}

/** Adds `expr` to a `cn(…)` call: before the consumer's `className`, or else at the end. */
function addToCn(call: string, expr: string): string {
	const inner = call.slice(3, -1);
	const className = /(,\s*)className(\s*,?\s*)$/.exec(inner);
	if (className) {
		const before = inner.slice(0, className.index);
		return `cn(${before}${className[1]}${expr}${className[1]}className${className[2]})`;
	}
	return `cn(${inner.replace(/,?\s*$/, "")}, ${expr})`;
}

/** Rewrites the `class` in `tag` (a static string or a `cn()` call) to include `expr`. */
function themeClass(tag: string, expr: string): string | undefined {
	if (tag.includes("theme.classes(")) return undefined;
	const staticClass = /\bclass="([^"]*)"/.exec(tag);
	if (staticClass) {
		return tag.replace(staticClass[0], `class={cn("${staticClass[1]}", ${expr})}`);
	}
	const cnStart = tag.search(/\bclass(?:=\{|: )cn\(/);
	if (cnStart === -1) return undefined;
	const callStart = tag.indexOf("cn(", cnStart);
	const callEnd = matchBracket(tag, callStart + 2);
	return (
		tag.slice(0, callStart) +
		addToCn(tag.slice(callStart, callEnd + 1), expr) +
		tag.slice(callEnd + 1)
	);
}

/** Identifiers imported from our own components; tags using them theme themselves. */
function ownComponents(source: string): Set<string> {
	const names = new Set<string>();
	const imports = source.matchAll(
		/import\s+(?:\*\s+as\s+(\w+)|(\w+)|\{([^}]*)\})\s+from\s+"([^"]+)"/g,
	);
	for (const [, namespace, defaultName, named, path] of imports) {
		const isOwn =
			path.includes("/components/ui/") || (path.startsWith("./") && path.endsWith(".svelte"));
		if (!isOwn) continue;
		for (const name of [namespace, defaultName, ...(named?.split(",") ?? [])]) {
			const local = name
				?.trim()
				.split(/\s+as\s+/)
				.at(-1);
			if (local && !local.startsWith("type ")) names.add(local);
		}
	}
	return names;
}

function themeFile(source: string): { source: string; count: number } {
	let count = 0;
	const own = ownComponents(source);
	const markupStart = source.lastIndexOf("</script>");

	// Elements in the markup: `data-slot="name"` or `data-slot={dataSlot}`.
	const slotPattern = /data-slot=(?:"([a-z-]+)"|\{dataSlot\})/g;
	for (let match; (match = slotPattern.exec(source));) {
		if (match.index < markupStart) continue;
		const start = source.lastIndexOf("<", match.index);
		const tagName = /^<([\w.]+)/.exec(source.slice(start))?.[1] ?? "";
		if (own.has(tagName.split(".")[0])) continue;
		const end = tagEnd(source, start);
		const expr = match[1] ? `theme.classes("${match[1]}")` : "theme.classes(dataSlot as Slot)";
		const themed = themeClass(source.slice(start, end + 1), expr);
		if (!themed) continue;
		source = source.slice(0, start) + themed + source.slice(end + 1);
		slotPattern.lastIndex = start + themed.length;
		count++;
	}

	// Props objects in the script: `{ class: cn(…), "data-slot": "name", … }`.
	const objectPattern = /"data-slot": "([a-z-]+)"/g;
	for (let match; (match = objectPattern.exec(source));) {
		if (match.index > markupStart) continue;
		let start = match.index;
		for (let depth = 0; start > 0; start--) {
			if (source[start] === "}") depth++;
			else if (source[start] === "{" && depth-- === 0) break;
		}
		const end = matchBracket(source, start);
		const themed = themeClass(source.slice(start, end + 1), `theme.classes("${match[1]}")`);
		if (!themed) continue;
		source = source.slice(0, start) + themed + source.slice(end + 1);
		objectPattern.lastIndex = start + themed.length;
		count++;
	}

	if (count === 0) return { source, count };

	// Imports and `const theme = useTheme()` in the instance script (the one with `$props()`).
	const props = source.indexOf("$props();");
	const scriptStart = source.lastIndexOf('<script lang="ts">', props) + '<script lang="ts">'.length;
	const imports = [
		!source.includes("useTheme") && 'import { useTheme } from "#lib/themes/context.ts";',
		source.includes("as Slot)") &&
			!source.includes("type Slot") &&
			'import type { Slot } from "#lib/themes/types.ts";',
		!/import \{[^}]*\bcn\b/.test(source) && 'import { cn } from "#lib/utils.ts";',
	].filter(Boolean);
	if (!source.includes("useTheme()")) {
		const lineEnd = source.indexOf("\n", props);
		source = `${source.slice(0, lineEnd)}\n\n\tconst theme = useTheme();${source.slice(lineEnd)}`;
	}
	if (imports.length) {
		source = `${source.slice(0, scriptStart)}\n\t${imports.join("\n\t")}${source.slice(scriptStart)}`;
	}
	return { source, count };
}

for (const file of files) {
	const original = readFileSync(file, "utf8");
	const { source, count } = themeFile(original);
	if (source !== original) {
		writeFileSync(file, source);
		console.log(`${file}: themed ${count} element(s)`);
	}
}

// Slot names from all of `src`, so app components can define themeable parts too (they call
// `theme.classes()` themselves).
const slots = new Set<string>();
for (const file of readdirSync("src", { recursive: true, encoding: "utf8" })) {
	if (!file.endsWith(".svelte")) continue;
	const source = readFileSync(join("src", file), "utf8");
	for (const [, slot] of source.matchAll(
		/(?:data-slot="|"data-slot": (?:dataSlot = )?")([a-z-]+)"/g,
	)) {
		slots.add(slot);
	}
}

writeFileSync(
	slotsFile,
	`// Generated by \`pnpm themes:sync\` (scripts/theme-components.ts) from the \`data-slot\`
// names in \`src\`. Don't edit by hand.

export type GeneratedSlot =
${[...slots]
	.sort()
	.map((slot) => `\t| "${slot}"`)
	.join("\n")};
`,
);
console.log(`${slotsFile}: ${slots.size} slots`);
