/**
 * The extension points their owners declare (core's in `src/lib/<domain>/extensions.ts`, a module's
 * in its `api/extensions.ts`, see `#lib/extensions/define.ts`) and what the modules contribute to
 * them by file: a component at a slot (`slots/<point id>/<name>.svelte`) and bulk actions for a
 * table (`bulk-actions/<point id>.ts`). Read from the source, without running it: a point's id is
 * a string literal. Hooks are contributed in code (`server/index.ts`), so only their points are
 * read here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { byName, GENERATED, type ModuleFolder } from "./shared.ts";

const kinds = {
	Slot: "slot",
	BulkTable: "bulk",
	Collector: "collector",
	Event: "event",
	Vote: "vote",
} as const;

/** An extension point as its owner's `extensions.ts` declares it. */
export interface ExtensionPoint {
	/** E.g. `orders.detail.side`: its owner's id, a dot, and a name. */
	id: string;
	kind: (typeof kinds)[keyof typeof kinds];
	/** Core's domain folder (`orders`) or the module's id (`invoicing`). */
	owner: string;
	/** The file that declares it, relative to the root, with `/`. */
	file: string;
	/** The name it's exported as. */
	exportName: string;
}

const kindNames: Record<ExtensionPoint["kind"], string> = {
	slot: "a slot",
	bulk: "a bulk table",
	collector: "a collector",
	event: "an event",
	vote: "a vote",
};

/** `export const <name> = define<Kind>`, before the type arguments and the id. */
const declaration = new RegExp(
	String.raw`\bexport\s+const\s+([\w$]+)\s*=\s*define(${Object.keys(kinds).join("|")})\b`,
	"g",
);

/** The text without its comments (block comments, and line comments that start a line). */
const withoutComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The string literal that `source` has at `index`, after optional type arguments, `(` and
 * whitespace, or `undefined` if it doesn't have one there.
 */
function literalIdAt(source: string, index: number) {
	let at = index;
	while (/\s/.test(source[at] ?? "")) at++;
	if (source[at] === "<") {
		// Skip the type arguments, which nest (`Map<number, X[]>`) and may hold arrows (`=>`).
		let depth = 0;
		for (; at < source.length; at++) {
			if (source[at] === "<") depth++;
			else if (source[at] === ">" && source[at - 1] !== "=" && --depth === 0) break;
		}
		at++;
	}
	return /^\s*\(\s*(["'`])([^"'`$]+)\1/.exec(source.slice(at))?.[2];
}

/** The points declared in `file` (relative to `root`), owned by `owner`. */
function pointsIn(root: string, file: string, owner: string): ExtensionPoint[] {
	const source = withoutComments(readFileSync(join(root, file), "utf8"));
	return [...source.matchAll(declaration)].flatMap((match) => {
		const id = literalIdAt(source, match.index + match[0].length);
		const kind = kinds[match[2] as keyof typeof kinds];
		return id ? [{ id, kind, owner, file, exportName: match[1] }] : [];
	});
}

const folders = (dir: string) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.toSorted(byName)
		: [];

/**
 * The extension points declared in `src/lib/<domain>/extensions.ts` (owned by the domain) and
 * `src/modules/<id>/api/extensions.ts` (owned by the module), in file order.
 */
export function findPoints(root: string): ExtensionPoint[] {
	const files = [
		...folders(join(root, "src/lib")).map((owner) => ({
			owner,
			file: `src/lib/${owner}/extensions.ts`,
		})),
		...folders(join(root, "src/modules")).map((owner) => ({
			owner,
			file: `src/modules/${owner}/api/extensions.ts`,
		})),
	];
	return files
		.filter(({ file }) => existsSync(join(root, file)))
		.flatMap(({ owner, file }) => pointsIn(root, file, owner));
}

/** A module's contribution, as its file says: to which point, of which kind, and its name. */
interface FileContribution {
	/** Relative to the module's folder. */
	file: string;
	kind: "slot" | "bulk";
	point: string;
	/** A slot component's name: its file name. */
	name: string;
}

const slotFile = /^slots\/([^/]+)\/([^/]+)\.svelte$/;
const bulkFile = /^bulk-actions\/([^/]+)\.ts$/;

/** The module's contributions, and its contribution files that are in the wrong place. */
function contributionsOf(module: ModuleFolder) {
	const contributions: FileContribution[] = [];
	const misplaced: string[] = [];
	for (const file of module.slotFiles) {
		const match = slotFile.exec(file);
		if (match) contributions.push({ file, kind: "slot", point: match[1], name: match[2] });
		else misplaced.push(`${file}: a slot's component is slots/<point id>/<name>.svelte.`);
	}
	for (const file of module.bulkFiles) {
		const match = bulkFile.exec(file);
		if (match) contributions.push({ file, kind: "bulk", point: match[1], name: match[1] });
		else misplaced.push(`${file}: a table's bulk actions are bulk-actions/<point id>.ts.`);
	}
	return { contributions, misplaced };
}

/**
 * What's wrong with the points and the modules' contributions to them: a point's id must start
 * with its owner's (`orders.…`) and be unique; a contribution must name an existing point of its
 * kind whose owner is core, the module itself, or a module it requires or enhances. A point's
 * owner is a module when a module has that id, like the kernel's dispatch decides.
 */
export function extensionProblems(points: ExtensionPoint[], modules: ModuleFolder[]): string[] {
	const problems: string[] = [];
	const byId = new Map<string, ExtensionPoint>();
	for (const point of points) {
		if (!point.id.startsWith(`${point.owner}.`)) {
			problems.push(
				`${point.file} declares ${point.id}: an extension point's id starts with its owner, ${point.owner}.`,
			);
		}
		const other = byId.get(point.id);
		if (!other) byId.set(point.id, point);
		else if (other.file === point.file) {
			problems.push(`${point.file} declares ${point.id} twice: an extension point's id is unique.`);
		} else {
			problems.push(
				`${point.file} declares ${point.id}, which ${other.file} declares too: an extension point's id is unique.`,
			);
		}
	}

	const moduleIds = new Set(modules.map((module) => module.id));
	for (const module of modules) {
		const { contributions, misplaced } = contributionsOf(module);
		const at = (file: string) => `src/modules/${module.id}/${file}`;
		problems.push(...misplaced.map((problem) => `src/modules/${module.id}/${problem}`));
		for (const contribution of contributions) {
			const point = byId.get(contribution.point);
			if (!point) {
				problems.push(
					`${at(contribution.file)}: there is no extension point ${contribution.point}.`,
				);
			} else if (point.kind !== contribution.kind) {
				problems.push(
					`${at(contribution.file)}: ${point.id} is ${kindNames[point.kind]}, not ${kindNames[contribution.kind]}.`,
				);
			} else if (
				moduleIds.has(point.owner) &&
				point.owner !== module.id &&
				!module.requires.includes(point.owner) &&
				!module.enhances.includes(point.owner)
			) {
				problems.push(
					`${at(contribution.file)}: ${module.id} neither requires nor enhances ${point.owner}.`,
				);
			}
		}
	}
	return problems;
}

/** `orders.detail.side` → `ordersDetailSide`: the name a point is imported as. */
const localName = (id: string) => id.replace(/[.-](\w)/g, (_, c: string) => c.toUpperCase());

/** `src/lib/orders/extensions.ts` → `#lib/orders/extensions.ts`. */
const specifier = (file: string) =>
	file.replace(/^src\/lib\//, "#lib/").replace(/^src\/modules\//, "#modules/");

/**
 * `src/lib/extensions/contributions.gen.ts`: the modules' contributions by file, in registry order
 * (`modules` is), each a typed call, so the type check holds a component to its slot's props and
 * bulk actions to their table's rows. Expects `extensionProblems()` to have found nothing.
 */
export function renderContributions(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const byId = new Map(points.map((point) => [point.id, point]));
	const all = modules.flatMap((module) =>
		contributionsOf(module).contributions.map((contribution) => ({ module, contribution })),
	);
	const slots = all.filter(({ contribution }) => contribution.kind === "slot");
	const bulk = all.filter(({ contribution }) => contribution.kind === "bulk");

	const used = new Map<string, ExtensionPoint[]>();
	for (const { contribution } of all) {
		const point = byId.get(contribution.point);
		if (!point) continue;
		const named = used.get(point.file) ?? [];
		if (!named.includes(point)) used.set(point.file, [...named, point]);
	}
	const imports = [...used]
		.toSorted(([a], [b]) => byName(specifier(a), specifier(b)))
		.map(
			([file, named]) =>
				`import { ${named
					.toSorted((a, b) => byName(a.exportName, b.exportName))
					.map((point) => `${point.exportName} as ${localName(point.id)}`)
					.join(", ")} } from "${specifier(file)}";`,
		);

	const load = (module: ModuleFolder, file: string) =>
		`() => import("#modules/${module.id}/${file}")`;
	const list = (entries: string[]) =>
		entries.length ? `[\n${entries.map((entry) => `\t${entry},`).join("\n")}\n]` : "[]";

	return [
		`// ${GENERATED} from src/modules/*/slots and src/modules/*/bulk-actions. Don't edit.`,
		`import {`,
		`\ttype AnyBulkContribution,`,
		`\ttype AnySlotContribution,`,
		`\tbulkContribution,`,
		`\tslotContribution,`,
		`} from "#lib/extensions/define.ts";`,
		...imports,
		"",
		`/** The components the modules add at slots, in registry order. */`,
		`export const slotContributions: readonly AnySlotContribution[] = ${list(
			slots.map(
				({ module, contribution }) =>
					`slotContribution(${localName(contribution.point)}, ${JSON.stringify(module.id)}, ${JSON.stringify(contribution.name)}, ${load(module, contribution.file)})`,
			),
		)};`,
		"",
		`/** The bulk actions the modules add to tables, in registry order. */`,
		`export const bulkContributions: readonly AnyBulkContribution[] = ${list(
			bulk.map(
				({ module, contribution }) =>
					`bulkContribution(${localName(contribution.point)}, ${JSON.stringify(module.id)}, ${load(module, contribution.file)})`,
			),
		)};`,
		"",
	].join("\n");
}
