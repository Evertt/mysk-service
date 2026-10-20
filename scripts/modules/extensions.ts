/**
 * The extension points their owners declare (core's in `src/lib/<domain>/extensions.ts`, a module's
 * in its `api/extensions.ts`, see `#lib/extensions/define.ts`) and what the modules contribute to
 * them by file: a component at a slot (`slots/<point id>/<name>.svelte`), bulk actions for a
 * table (`bulk-actions/<point id>.ts`), a list's columns (`columns/<point id>.ts` and their SQL) and
 * a part of a form (its components at the form slot, and its schema in `form-parts/<point id>.ts`). Read from the source, without running it: a point's id is
 * a string literal. Hooks are contributed in code (`server/index.ts`), so only their points are
 * read here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { formPartKey } from "#lib/extensions/form-part-key.ts";

import { byName, GENERATED, type ModuleFolder } from "./shared.ts";

const kinds = {
	Slot: "slot",
	FormSlot: "form",
	BulkTable: "bulk",
	Collector: "collector",
	Event: "event",
	Vote: "vote",
	SaveHook: "save",
} as const;

/** An extension point as its owner's `extensions.ts` declares it. */
export interface ExtensionPoint {
	/** E.g. `orders.detail.side`: its owner's id, a dot, and a name. */
	id: string;
	/** Its kind; a list that takes columns is always a record's (`defineRecordPoints()`). */
	kind: (typeof kinds)[keyof typeof kinds] | "columns";
	/** Core's domain folder (`orders`) or the module's id (`invoices`). */
	owner: string;
	/** The file that declares it, relative to the root, with `/`. */
	file: string;
	/** The name it's exported as. */
	exportName: string;
	/**
	 * Where it is in that export, for a record's points (`defineRecordPoints()`, e.g.
	 * `detail.side`); none for a point that is the export.
	 */
	member?: string;
}

const kindNames: Record<ExtensionPoint["kind"], string> = {
	slot: "a slot",
	form: "a form slot",
	bulk: "a bulk table",
	columns: "a list that takes columns",
	collector: "a collector",
	event: "an event",
	vote: "a vote",
	save: "a save hook",
};

/** `export const <name> = define<Kind>`, before the type arguments and the id. */
const declaration = new RegExp(
	String.raw`\bexport\s+const\s+([\w$]+)\s*=\s*define(${Object.keys(kinds).join("|")})\b`,
	"g",
);

/** `export const <name> = defineRecordPoints`, before the owner. */
const recordDeclaration = /\bexport\s+const\s+([\w$]+)\s*=\s*defineRecordPoints\b/g;

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

/** The text of the call's arguments that starts at `index` (just after its `(`), up to its `)`. */
function argumentsAt(source: string, index: number) {
	let depth = 1;
	for (let at = index; at < source.length; at++) {
		if ("([{".includes(source[at])) depth++;
		else if (")]}".includes(source[at]) && --depth === 0) return source.slice(index, at);
	}
	return source.slice(index);
}

/**
 * The points of a record that `defineRecordPoints(<owner>, options)` declares at `index` (after
 * its name): the two detail slots always, the list's columns and bulk table if its options name
 * them (`listColumns: true`, `bulk: …`).
 */
function recordPointsAt(source: string, index: number, file: string, owner: string, name: string) {
	const record = literalIdAt(source, index);
	if (!record) return [];
	const options = argumentsAt(source, source.indexOf("(", index) + 1);
	const point = (member: string, kind: ExtensionPoint["kind"]): ExtensionPoint => ({
		id: `${record}.${member}`,
		kind,
		owner,
		file,
		exportName: name,
		member,
	});
	return [
		point("detail.main", "slot"),
		point("detail.side", "slot"),
		...(/\blistColumns\s*:\s*true\b/.test(options) ? [point("list.columns", "columns")] : []),
		...(/\bbulk\s*:/.test(options) ? [point("list.bulk", "bulk")] : []),
	];
}

/** The points declared in `file` (relative to `root`), owned by `owner`. */
function pointsIn(root: string, file: string, owner: string): ExtensionPoint[] {
	const source = withoutComments(readFileSync(join(root, file), "utf8"));
	const declared = [...source.matchAll(declaration)].map((match) => {
		const id = literalIdAt(source, match.index + match[0].length);
		const kind = kinds[match[2] as keyof typeof kinds];
		return { at: match.index, points: id ? [{ id, kind, owner, file, exportName: match[1] }] : [] };
	});
	const records = [...source.matchAll(recordDeclaration)].map((match) => ({
		at: match.index,
		points: recordPointsAt(source, match.index + match[0].length, file, owner, match[1]),
	}));
	return [...declared, ...records].toSorted((a, b) => a.at - b.at).flatMap(({ points }) => points);
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
	/** `slot` for a component at a slot or a form slot; `part` for a form part's schema. */
	kind: "slot" | "bulk" | "columns" | "part";
	point: string;
	/** A slot component's name: its file name. */
	name: string;
}

const slotFile = /^slots\/([^/]+)\/([^/]+)\.svelte$/;
const bulkFile = /^bulk-actions\/([^/]+)\.ts$/;
const columnsFile = /^columns\/([^/]+)\.ts$/;
const serverColumnsFile = /^server\/columns\/([^/]+)\.ts$/;
const formPartFile = /^form-parts\/([^/]+)\.ts$/;

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
	// A list's columns come in two halves, the definitions and their SQL, which go together.
	const serverHalves = new Set(module.serverColumnFiles);
	for (const file of module.columnFiles) {
		const match = columnsFile.exec(file);
		if (!match) {
			misplaced.push(`${file}: a list's columns are columns/<point id>.ts.`);
			continue;
		}
		contributions.push({ file, kind: "columns", point: match[1], name: match[1] });
		if (!serverHalves.has(`server/${file}`)) {
			misplaced.push(`${file}: its columns' SQL is missing, in server/${file}.`);
		}
	}
	const halves = new Set(module.columnFiles);
	for (const file of module.serverColumnFiles) {
		const match = serverColumnsFile.exec(file);
		if (!match) misplaced.push(`${file}: a list's columns' SQL is server/columns/<point id>.ts.`);
		else if (!halves.has(`columns/${match[1]}.ts`)) {
			misplaced.push(
				`${file}: the columns it's the SQL of are missing, in columns/${match[1]}.ts.`,
			);
		}
	}
	for (const file of module.formPartFiles) {
		const match = formPartFile.exec(file);
		if (match) contributions.push({ file, kind: "part", point: match[1], name: match[1] });
		else misplaced.push(`${file}: a form's part's schema is form-parts/<point id>.ts.`);
	}
	return { contributions, misplaced };
}

/** The kinds of point a contribution of `kind` may go to. */
const pointKinds: Record<FileContribution["kind"], ExtensionPoint["kind"][]> = {
	slot: ["slot", "form"],
	bulk: ["bulk"],
	columns: ["columns"],
	part: ["form"],
};

/** The kind of point a contribution of `kind` is named after in a problem. */
const contributionKinds: Record<FileContribution["kind"], ExtensionPoint["kind"]> = {
	slot: "slot",
	bulk: "bulk",
	columns: "columns",
	part: "form",
};

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
		// A form slot's components and the schema of their part go together.
		const parts = new Set(
			contributions.filter(({ kind }) => kind === "part").map(({ point }) => point),
		);
		const rendered = new Set(
			contributions.filter(({ kind }) => kind === "slot").map(({ point }) => point),
		);
		for (const contribution of contributions) {
			const point = byId.get(contribution.point);
			if (!point) {
				problems.push(
					`${at(contribution.file)}: there is no extension point ${contribution.point}.`,
				);
			} else if (!pointKinds[contribution.kind].includes(point.kind)) {
				problems.push(
					`${at(contribution.file)}: ${point.id} is ${kindNames[point.kind]}, not ${kindNames[contributionKinds[contribution.kind]]}.`,
				);
			} else if (point.kind === "form" && contribution.kind === "slot" && !parts.has(point.id)) {
				problems.push(
					`${at(contribution.file)}: its part's schema is missing, in form-parts/${point.id}.ts.`,
				);
			} else if (contribution.kind === "part" && !rendered.has(point.id)) {
				problems.push(
					`${at(contribution.file)}: no component renders the part, in slots/${point.id}/<name>.svelte.`,
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

/** `orders.detail.side` → `ordersDetailSide`. */
const localName = (id: string) => id.replace(/[.-](\w)/g, (_, c: string) => c.toUpperCase());

/**
 * The name a point's export is imported as: the point's own name (`ordersForm`), or for a record's
 * points the export's, with its owner (`ordersPoints`).
 */
const bindingName = (point: ExtensionPoint) =>
	localName(point.member ? `${point.owner}.${point.exportName}` : point.id);

/** How the generated code names a point: `ordersForm`, `ordersPoints.detail.side`. */
const pointRef = (point: ExtensionPoint) =>
	point.member ? `${bindingName(point)}.${point.member}` : bindingName(point);

/** `materials` and `orders.form` → `materialsOrdersFormPart`: the name a part's schema is imported as. */
const partName = (module: ModuleFolder, point: string) =>
	`${module.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}${localName(`.${point}`)}Part`;

/** `src/lib/orders/extensions.ts` → `#lib/orders/extensions.ts`. */
const specifier = (file: string) =>
	file.replace(/^src\/lib\//, "#lib/").replace(/^src\/modules\//, "#modules/");

/** The modules' contributions by file, in registry order, with the points they go to. */
function allContributions(points: ExtensionPoint[], modules: ModuleFolder[]) {
	const byId = new Map(points.map((point) => [point.id, point]));
	return modules.flatMap((module) =>
		contributionsOf(module).contributions.flatMap((contribution) => {
			const point = byId.get(contribution.point);
			return point ? [{ module, contribution, point }] : [];
		}),
	);
}

/** The imports of `points`' exports, each as its `bindingName()`, by file. */
function pointImports(points: ExtensionPoint[]) {
	const used = new Map<string, Map<string, string>>();
	for (const point of points) {
		const named = used.get(point.file) ?? new Map<string, string>();
		named.set(point.exportName, bindingName(point));
		used.set(point.file, named);
	}
	return [...used]
		.toSorted(([a], [b]) => byName(specifier(a), specifier(b)))
		.map(
			([file, named]) =>
				`import { ${[...named]
					.toSorted(([a], [b]) => byName(a, b))
					.map(([exported, local]) => `${exported} as ${local}`)
					.join(", ")} } from "${specifier(file)}";`,
		);
}

const listOf = (entries: string[]) =>
	entries.length ? `[\n${entries.map((entry) => `\t${entry},`).join("\n")}\n]` : "[]";

/**
 * `src/lib/extensions/contributions.gen.ts`: the modules' contributions by file, in registry order
 * (`modules` is), each a typed call, so the type check holds a component to its slot's props and
 * bulk actions to their table's rows. Expects `extensionProblems()` to have found nothing.
 */
export function renderContributions(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const all = allContributions(points, modules).filter(
		({ contribution }) => contribution.kind !== "part",
	);
	const of = (kind: FileContribution["kind"]) =>
		all.filter(({ contribution }) => contribution.kind === kind);
	const load = (module: ModuleFolder, file: string) =>
		`() => import("#modules/${module.id}/${file}")`;
	// A component at a form slot is held to its module's part's schema, imported only as a type.
	const atForms = of("slot").filter(({ point }) => point.kind === "form");
	const partImports = [
		...new Set(
			atForms.map(
				({ module, point }) =>
					`import type ${partName(module, point.id)} from "#modules/${module.id}/form-parts/${point.id}.ts";`,
			),
		),
	];
	const slotCall = ({ module, contribution, point }: (typeof all)[number]) => {
		const args = `${pointRef(point)}, ${JSON.stringify(module.id)}, ${JSON.stringify(contribution.name)}, ${load(module, contribution.file)}`;
		return point.kind === "form"
			? `formSlotContribution<typeof ${pointRef(point)}, typeof ${partName(module, point.id)}>(${args})`
			: `slotContribution(${args})`;
	};

	return [
		`// ${GENERATED} from src/modules/*/slots, src/modules/*/bulk-actions, src/modules/*/columns and src/modules/*/form-parts. Don't edit.`,
		`import {`,
		`\ttype AnyBulkContribution,`,
		`\ttype AnySlotContribution,`,
		`\tbulkContribution,`,
		`\ttype ColumnsContribution,`,
		`\tcolumnsContribution,`,
		...(atForms.length ? [`\tformSlotContribution,`] : []),
		`\tslotContribution,`,
		`} from "#lib/extensions/define.ts";`,
		...pointImports(all.map(({ point }) => point)),
		...partImports,
		"",
		`/** The components the modules add at slots, in registry order. */`,
		`export const slotContributions: readonly AnySlotContribution[] = ${listOf(
			of("slot").map(slotCall),
		)};`,
		"",
		`/** The bulk actions the modules add to tables, in registry order. */`,
		`export const bulkContributions: readonly AnyBulkContribution[] = ${listOf(
			of("bulk").map(
				({ module, contribution, point }) =>
					`bulkContribution(${pointRef(point)}, ${JSON.stringify(module.id)}, ${load(module, contribution.file)})`,
			),
		)};`,
		"",
		`/** The columns the modules add to lists (their definitions and cells), in registry order. */`,
		`export const columnContributions: readonly ColumnsContribution[] = ${listOf(
			of("columns").map(
				({ module, contribution, point }) =>
					`columnsContribution(${pointRef(point)}, ${JSON.stringify(module.id)}, ${load(module, contribution.file)})`,
			),
		)};`,
		"",
	].join("\n");
}

/**
 * `src/lib/server/lists/columns.gen.ts`: the SQL of the columns the modules add to lists
 * (`server/columns/<point id>.ts`), in registry order, for `withModuleColumns()`. Server-only, and
 * imported statically: the server merges a tenant's columns while it plans the list.
 */
export function renderColumnSql(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const columns = allContributions(points, modules).filter(
		({ contribution }) => contribution.kind === "columns",
	);
	const sqlName = (module: ModuleFolder, point: string) =>
		`${module.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}${localName(`.${point}`)}`;
	return [
		`// ${GENERATED} from src/modules/*/server/columns. Don't edit.`,
		`import type { ColumnSqlContribution } from "./column-sql.ts";`,
		...pointImports(columns.map(({ point }) => point)),
		...columns.map(
			({ module, contribution }) =>
				`import ${sqlName(module, contribution.point)} from "#modules/${module.id}/server/${contribution.file}";`,
		),
		"",
		`/**`,
		` * A function, like the server registry of hooks: nothing is read while the modules load.`,
		` */`,
		`export function generatedColumnSql(): readonly ColumnSqlContribution[] {`,
		`\treturn ${listOf(
			columns.map(
				({ module, contribution, point }) =>
					`{ module: ${JSON.stringify(module.id)}, point: ${pointRef(point)}, columns: ${sqlName(module, contribution.point)} }`,
			),
		).replaceAll("\n", "\n\t")};`,
		`}`,
		"",
	].join("\n");
}

/**
 * `src/lib/extensions/form-parts.gen.ts`: the schemas of the parts the modules add to forms
 * (`form-parts/<point id>.ts`), by form slot and module, in registry order, imported statically:
 * the form's schema (`formPartsSchema()` in `#lib/extensions/form-parts.ts`) is made from them at
 * module scope, for the server's validation and the browser's preflight alike. Every form slot has
 * an entry, an empty one without parts. Isomorphic.
 */
export function renderFormParts(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const parts = allContributions(points, modules).filter(
		({ contribution }) => contribution.kind === "part",
	);
	const entries = points
		.filter((point) => point.kind === "form")
		.map((point) => {
			const named = parts
				.filter((part) => part.point.id === point.id)
				.map(
					({ module }) =>
						`${JSON.stringify(formPartKey(module.id))}: ${partName(module, point.id)}`,
				);
			return `${JSON.stringify(point.id)}: ${named.length ? `{ ${named.join(", ")} }` : "{}"},`;
		});
	return [
		`// ${GENERATED} from src/modules/*/form-parts. Don't edit.`,
		...parts.map(
			({ module, point, contribution }) =>
				`import ${partName(module, point.id)} from "#modules/${module.id}/${contribution.file}";`,
		),
		"",
		`/** The schemas of the modules' parts of forms, by form slot id and module (its part's key, \`formPartKey()\`). */`,
		`export const formParts = ${entries.length ? `{\n${entries.map((entry) => `\t${entry}`).join("\n")}\n}` : "{}"};`,
		"",
	].join("\n");
}
