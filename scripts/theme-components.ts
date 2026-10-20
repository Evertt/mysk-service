/**
 * Makes the shadcn-svelte components in `src/lib/components/ui` themeable, and lists their parts
 * for the theme types. Run it after adding or updating components: `pnpm themes:sync`
 * (`theme-components.spec.ts` fails until you have).
 *
 * For every element with a `data-slot`, the theme's classes for that slot are merged in between
 * the component's own classes and the consumer's `class`:
 *
 *   class={cn("…shadcn classes…", className)}
 *   → class={cn("…shadcn classes…", theme.classes("card-header"), className)}
 *
 * It reads the components with Svelte's own parser and edits them with `magic-string`, so only
 * those spots change. Elements that are our own components (`<Input>`, `<Dialog.Content>`, …) are
 * skipped, since those theme themselves. Already-themed elements are left alone, so the script can
 * be re-run. Classes per variant or size (e.g. `theme.classes("button", { variant, size })`) are
 * added by hand once.
 *
 * Why not plain CSS (`[data-theme=x] [data-slot=y] { @apply … }`)? A theme's classes must beat the
 * component's own and lose to the `class` its user passes. In CSS both of those are utilities of
 * the same specificity, so a rule can't sit between them; only `cn()` merging the class strings in
 * that order can.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import MagicString from "magic-string";
import { type AST, parse } from "svelte/compiler";

const uiDir = "src/lib/components/ui";
const slotsFile = "src/lib/themes/slots.ts";

// The parts of the AST this reads, loosely: estree and Svelte nodes alike.
interface Node {
	type: string;
	start: number;
	end: number;
	[key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
	typeof value === "object" && value !== null && typeof (value as Node).type === "string";

/** Every node under `root`, depth first. */
function* nodes(root: unknown): Generator<Node> {
	if (Array.isArray(root)) {
		for (const item of root) yield* nodes(item);
	} else if (isNode(root)) {
		yield root;
		for (const [key, value] of Object.entries(root)) {
			if (key !== "metadata" && typeof value === "object") yield* nodes(value);
		}
	}
}

const svelteFiles = (dir: string) =>
	readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".svelte"))
		.map((file) => join(dir, file))
		.sort();

/** A string literal's value: `"card"`, or the default in `"data-slot": dataSlot = "input"`. */
function literal(node: unknown): string | undefined {
	if (!isNode(node)) return undefined;
	if (node.type === "Literal" && typeof node.value === "string") return node.value;
	if (node.type === "AssignmentPattern") return literal(node.right);
	return undefined;
}

const propertyNamed = (object: Node, name: string) =>
	(object.properties as Node[]).find(
		(property) =>
			property.type === "Property" &&
			((property.key as Node).name === name || literal(property.key) === name),
	);

const isObject = (node: Node) => node.type === "ObjectExpression" || node.type === "ObjectPattern";

/**
 * The `data-slot` of a template element, a props object or the props' destructuring (with a
 * default): a name, `dataSlot`, or none.
 */
function slotOf(node: Node): string | { dynamic: true } | undefined {
	if (isObject(node)) return literal(propertyNamed(node, "data-slot")?.value);
	const attribute = (node.attributes as Node[]).find(
		(attribute) => attribute.type === "Attribute" && attribute.name === "data-slot",
	);
	const value = attribute?.value;
	if (Array.isArray(value) && value.length === 1 && value[0].type === "Text") return value[0].data;
	if (isNode(value) && (value.expression as Node).name === "dataSlot") return { dynamic: true };
	return undefined;
}

/** Identifiers imported from our own components; elements using them theme themselves. */
function ownComponents(script: AST.Script | null): Set<string> {
	const names = new Set<string>();
	for (const node of script?.content.body ?? []) {
		if (node.type !== "ImportDeclaration") continue;
		const path = String(node.source.value);
		if (!path.includes("/components/ui/") && !(path.startsWith("./") && path.endsWith(".svelte")))
			continue;
		for (const specifier of node.specifiers) names.add(specifier.local.name);
	}
	return names;
}

/**
 * Merges `expr` into a class: into a `cn(…)` call (before the consumer's `className`, or else at
 * the end), or turns a static `class="…"` into one. False for any other class, or one already
 * themed.
 */
function themeClass(code: MagicString, source: string, value: unknown, expr: string): boolean {
	if (Array.isArray(value) && value.length === 1 && value[0].type === "Text") {
		const text = value[0] as Node;
		code.overwrite(text.start - 1, text.end + 1, `{cn(${JSON.stringify(text.data)}, ${expr})}`);
		return true;
	}
	const call = isNode(value) && value.type === "ExpressionTag" ? value.expression : value;
	if (!isNode(call) || call.type !== "CallExpression" || (call.callee as Node).name !== "cn") {
		return false;
	}
	if (source.slice(call.start, call.end).includes("theme.classes(")) return false;
	const args = call.arguments as Node[];
	const last = args.at(-1);
	if (!last) code.appendLeft(call.end - 1, expr);
	else if (last.type === "Identifier" && last.name === "className")
		code.appendLeft(last.start, `${expr}, `);
	else code.appendLeft(last.end, `, ${expr}`);
	return true;
}

/** Adds the theme's classes to every slotted element of a component; how many it themed. */
export function themeComponent(source: string): { source: string; count: number } {
	const ast = parse(source, { modern: true });
	const code = new MagicString(source);
	const own = ownComponents(ast.instance);
	let count = 0;

	const theme = (node: Node, classValue: unknown) => {
		const slot = slotOf(node);
		if (!slot) return;
		const expr =
			typeof slot === "string" ? `theme.classes("${slot}")` : "theme.classes(dataSlot as Slot)";
		if (themeClass(code, source, classValue, expr)) count++;
	};

	// Elements in the markup: `data-slot="name"` or `data-slot={dataSlot}`.
	for (const node of nodes(ast.fragment)) {
		if (!["RegularElement", "SvelteElement", "Component"].includes(node.type)) continue;
		if (node.type === "Component" && own.has(String(node.name).split(".")[0])) continue;
		const classAttribute = (node.attributes as Node[]).find(
			(attribute) => attribute.type === "Attribute" && attribute.name === "class",
		);
		if (classAttribute) theme(node, classAttribute.value);
	}

	// Props objects in the script: `{ class: cn(…), "data-slot": "name", … }`.
	for (const node of nodes(ast.instance?.content)) {
		if (node.type !== "ObjectExpression") continue;
		const classProperty = propertyNamed(node, "class");
		if (classProperty) theme(node, classProperty.value);
	}

	if (count === 0) return { source, count };

	// `const theme = useTheme()` after `$props()`, and the imports, in the instance script.
	const script = ast.instance!.content;
	const imported = new Set(
		[...(ast.module?.content.body ?? []), ...script.body].flatMap((node) =>
			node.type === "ImportDeclaration" ? node.specifiers.map((s) => s.local.name) : [],
		),
	);
	const props = script.body.find(
		(node) =>
			node.type === "VariableDeclaration" &&
			node.declarations.some(
				(declaration) =>
					declaration.init?.type === "CallExpression" &&
					(declaration.init.callee as Node).name === "$props",
			),
	) as Node | undefined;
	if (!props) throw new Error("A themed component needs `$props()` in its instance script");
	if (!source.includes("useTheme()")) code.appendLeft(props.end, "\n\n\tconst theme = useTheme();");
	const imports = [
		!imported.has("useTheme") && 'import { useTheme } from "#lib/themes/context.ts";',
		code.toString().includes("as Slot)") &&
			!imported.has("Slot") &&
			'import type { Slot } from "#lib/themes/types.ts";',
		!imported.has("cn") && 'import { cn } from "#lib/utils.ts";',
	].filter(Boolean);
	if (imports.length) code.appendLeft(script.start, `\n\t${imports.join("\n\t")}`);

	return { source: code.toString(), count };
}

/**
 * The slot names in `files`, so app components can define themeable parts too (they call
 * `theme.classes()` themselves).
 */
export function slotNames(files: string[]): string[] {
	const slots = new Set<string>();
	for (const file of files) {
		const ast = parse(readFileSync(file, "utf8"), { modern: true });
		for (const node of nodes([ast.fragment, ast.instance?.content, ast.module?.content])) {
			const slot = isObject(node) || Array.isArray(node.attributes) ? slotOf(node) : undefined;
			if (typeof slot === "string") slots.add(slot);
		}
	}
	return [...slots].sort();
}

/** `slots.ts` for these names. */
export const slotsModule = (slots: string[]) =>
	`// Generated by \`pnpm themes:sync\` (scripts/theme-components.ts) from the \`data-slot\`
// names in \`src\`. Don't edit by hand.

export type GeneratedSlot =
${slots.map((slot) => `\t| "${slot}"`).join("\n")};
`;

export const uiFiles = () => svelteFiles(uiDir);
export const srcFiles = () => svelteFiles("src");

if (import.meta.main) {
	for (const file of uiFiles()) {
		const original = readFileSync(file, "utf8");
		const { source, count } = themeComponent(original);
		if (source !== original) {
			writeFileSync(file, source);
			console.log(`${file}: themed ${count} element(s)`);
		}
	}
	const slots = slotNames(srcFiles());
	writeFileSync(slotsFile, slotsModule(slots));
	console.log(`${slotsFile}: ${slots.length} slots`);
}
