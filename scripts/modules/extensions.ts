/**
 * The extension points their owners declare (core's in `src/lib/<domain>/extensions.ts`, a module's
 * in its `api/extensions.ts`, see `#lib/extensions/define.ts`) and what the modules contribute to
 * them by file, as `contributionKinds` lists them: a component at a slot, bulk actions for a table,
 * a list's columns (and their SQL) and a part of a form (its components at the form slot, and its
 * schema). Read from the source's syntax, without running it: a point's id is a string literal.
 * Hooks are contributed in code (`server/index.ts`), so only their points are read here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { formPartKey } from "#lib/extensions/form-part-key.ts";

import {
	byName,
	GENERATED,
	type ModuleFolder,
	parseProgram,
	propertiesOf,
	stringOf,
	walk,
} from "./shared.ts";

/** The kinds of extension point: the function that declares one, and how a problem names it. */
const pointKinds = {
	slot: { define: "defineSlot", name: "a slot" },
	form: { define: "defineFormSlot", name: "a form slot" },
	bulk: { define: "defineBulkTable", name: "a bulk table" },
	// Only a record's list takes columns (`defineRecordPoints()`).
	columns: { define: undefined, name: "a list that takes columns" },
	collector: { define: "defineCollector", name: "a collector" },
	event: { define: "defineEvent", name: "an event" },
	vote: { define: "defineVote", name: "a vote" },
	save: { define: "defineSaveHook", name: "a save hook" },
} as const;

type PointKind = keyof typeof pointKinds;

/** An extension point as its owner's `extensions.ts` declares it. */
export interface ExtensionPoint {
	/** E.g. `orders.detail.side`: its owner's id, a dot, and a name. */
	id: string;
	kind: PointKind;
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

/**
 * The kinds of file a module contributes with, in the order the generator checks and lists them.
 * Each is a file in `folder` (in the module's), named after its point (`<point id><extension>`, or
 * `<point id>/<name><extension>` for a slot's components), listed in the module's `field`; it goes
 * to a point of a kind in `to`, and comes with its `pair`'s file for the same point, if it has one.
 * `list` is its registry in `contributions.gen.ts`, made with its constructor (`call`) from
 * `#lib/extensions/define.ts`. A new kind is a row here.
 */
export const contributionKinds = {
	slot: {
		field: "slotFiles",
		folder: "slots",
		extension: ".svelte",
		named: true,
		is: "a slot's component is",
		to: ["slot", "form"],
		list: { name: "slotContributions", type: "AnySlotContribution", call: "slotContribution" },
		what: "The components the modules add at slots",
	},
	bulk: {
		field: "bulkFiles",
		folder: "bulk-actions",
		extension: ".ts",
		is: "a table's bulk actions are",
		to: ["bulk"],
		list: { name: "bulkContributions", type: "AnyBulkContribution", call: "bulkContribution" },
		what: "The bulk actions the modules add to tables",
	},
	columns: {
		field: "columnFiles",
		folder: "columns",
		extension: ".ts",
		is: "a list's columns are",
		to: ["columns"],
		pair: { kind: "sql", missing: "its columns' SQL is missing" },
		list: { name: "columnContributions", type: "ColumnsContribution", call: "columnsContribution" },
		what: "The columns the modules add to lists (their definitions and cells)",
	},
	// The other half of a list's columns, for the server (`renderColumnSql()`).
	sql: {
		field: "serverColumnFiles",
		folder: "server/columns",
		extension: ".ts",
		is: "a list's columns' SQL is",
		pair: { kind: "columns", missing: "the columns it's the SQL of are missing" },
	},
	// The schema of a module's part of a form, which its components at the form slot render
	// (`renderFormParts()`).
	part: {
		field: "formPartFiles",
		folder: "form-parts",
		extension: ".ts",
		is: "a form's part's schema is",
		to: ["form"],
	},
} as const;

type ContributionKind = keyof typeof contributionKinds;
type KindRow = (typeof contributionKinds)[ContributionKind];

/** A module's contribution files of each kind, relative to its folder, with `/`, sorted. */
export type ContributionFiles = Record<KindRow["field"], string[]>;

const kindRows = Object.entries(contributionKinds) as [ContributionKind, KindRow][];

/** The point and name of a contribution file of `row`'s kind, if it is where that kind's are. */
function placeOf(row: KindRow, file: string) {
	const prefix = `${row.folder}/`;
	if (!file.startsWith(prefix) || !file.endsWith(row.extension)) return undefined;
	const parts = file.slice(prefix.length, -row.extension.length).split("/");
	if (parts.length !== ("named" in row ? 2 : 1)) return undefined;
	return { point: parts[0], name: parts.at(-1)! };
}

/** Where a contribution of `row`'s kind to `point` is, relative to the module's folder. */
const fileOf = (row: KindRow, point: string, name = "<name>") =>
	`${row.folder}/${point}${"named" in row ? `/${name}` : ""}${row.extension}`;

/** The contribution files of each kind under a module's folder `dir` (see `walk()`). */
export function findContributionFiles(dir: string) {
	return Object.fromEntries(
		kindRows.map(([, row]) => [
			row.field,
			walk(join(dir, row.folder))
				.filter((file) => file.endsWith(row.extension) && !file.endsWith(".spec.ts"))
				.map((file) => `${row.folder}/${file}`),
		]),
	) as ContributionFiles;
}

/** The folders of a module that hold contribution files, for the watcher. */
export const contributionFolders = kindRows.map(([, row]) => row.folder);

/**
 * The points declared in `file` (relative to `root`), owned by `owner`, in their order: each
 * `export const <name> = define<Kind>("<id>", …)`, and a record's (`defineRecordPoints("<owner>",
 * options)`: the two detail slots always, the list's columns and bulk table if its options name
 * them, `listColumns: true`, `bulk: …`).
 */
function pointsIn(root: string, file: string, owner: string): ExtensionPoint[] {
	const program = parseProgram(file, readFileSync(join(root, file), "utf8"));
	return program.body.flatMap((statement) => {
		const declaration = statement.type === "ExportNamedDeclaration" && statement.declaration;
		if (
			!declaration ||
			declaration.type !== "VariableDeclaration" ||
			declaration.kind !== "const"
		) {
			return [];
		}
		return declaration.declarations.flatMap(({ id: binding, init }): ExtensionPoint[] => {
			if (binding.type !== "Identifier" || init?.type !== "CallExpression") return [];
			const callee = init.callee.type === "Identifier" ? init.callee.name : undefined;
			const [first, options] = init.arguments;
			const id = stringOf(first);
			if (!callee || !id) return [];
			const point = { owner, file, exportName: binding.name };
			if (callee === "defineRecordPoints") {
				const asked = propertiesOf(options);
				const listColumns = asked?.get("listColumns");
				const member = (name: string, kind: PointKind) => ({
					...point,
					id: `${id}.${name}`,
					kind,
					member: name,
				});
				return [
					member("detail.main", "slot"),
					member("detail.side", "slot"),
					...(listColumns?.type === "Literal" && listColumns.value === true
						? [member("list.columns", "columns")]
						: []),
					...(asked?.has("bulk") ? [member("list.bulk", "bulk")] : []),
				];
			}
			const kind = (Object.keys(pointKinds) as PointKind[]).find(
				(kind) => pointKinds[kind].define === callee,
			);
			return kind ? [{ id, kind, ...point }] : [];
		});
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

/** A module's contribution, as its file says: of which kind, to which point, and its name. */
interface FileContribution {
	/** Relative to the module's folder. */
	file: string;
	kind: ContributionKind;
	point: string;
	/** A slot component's name: its file name; else the point's id. */
	name: string;
}

/**
 * The module's contributions, and its contribution files that are in the wrong place or without
 * their pair's.
 */
function contributionsOf(module: ModuleFolder) {
	const contributions: FileContribution[] = [];
	const misplaced: string[] = [];
	for (const [kind, row] of kindRows) {
		for (const file of module[row.field]) {
			const place = placeOf(row, file);
			if (!place) {
				misplaced.push(`${file}: ${row.is} ${fileOf(row, "<point id>")}.`);
				continue;
			}
			if ("pair" in row) {
				const pair = contributionKinds[row.pair.kind];
				const other = fileOf(pair, place.point);
				if (!module[pair.field].includes(other)) {
					misplaced.push(`${file}: ${row.pair.missing}, in ${other}.`);
				}
			}
			if ("to" in row) contributions.push({ file, kind, ...place });
		}
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
		problems.push(...misplaced.map(at));
		// A form slot's components and the schema of their part go together.
		const pointsOf = (kind: ContributionKind) =>
			new Set(contributions.filter((c) => c.kind === kind).map(({ point }) => point));
		const parts = pointsOf("part");
		const rendered = pointsOf("slot");
		for (const contribution of contributions) {
			const point = byId.get(contribution.point);
			const row = contributionKinds[contribution.kind];
			const to: readonly PointKind[] = "to" in row ? row.to : [];
			if (!point) {
				problems.push(
					`${at(contribution.file)}: there is no extension point ${contribution.point}.`,
				);
			} else if (!to.includes(point.kind)) {
				problems.push(
					`${at(contribution.file)}: ${point.id} is ${pointKinds[point.kind].name}, not ${pointKinds[to[0]].name}.`,
				);
			} else if (point.kind === "form" && contribution.kind === "slot" && !parts.has(point.id)) {
				problems.push(
					`${at(contribution.file)}: its part's schema is missing, in ${fileOf(contributionKinds.part, point.id)}.`,
				);
			} else if (contribution.kind === "part" && !rendered.has(point.id)) {
				problems.push(
					`${at(contribution.file)}: no component renders the part, in ${fileOf(contributionKinds.slot, point.id)}.`,
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

/** The modules' contributions of `kind`, in registry order, with the points they go to. */
function allContributions(
	points: ExtensionPoint[],
	modules: ModuleFolder[],
	kind: ContributionKind,
) {
	const byId = new Map(points.map((point) => [point.id, point]));
	return modules.flatMap((module) =>
		contributionsOf(module).contributions.flatMap((contribution) => {
			const point = byId.get(contribution.point);
			return point && contribution.kind === kind ? [{ module, contribution, point }] : [];
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

/** `a`, `a and b`, `a, b and c`. */
const inWords = (items: string[]) =>
	items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items.join("");

/**
 * `src/lib/extensions/contributions.gen.ts`: the modules' contributions by file, in registry order
 * (`modules` is), each a typed call, so the type check holds a component to its slot's props and
 * bulk actions to their table's rows. Expects `extensionProblems()` to have found nothing.
 */
export function renderContributions(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const listed = kindRows.flatMap(([kind, row]) =>
		"list" in row ? [{ row, list: row.list, all: allContributions(points, modules, kind) }] : [],
	);
	// A component at a form slot is held to its module's part's schema, imported only as a type.
	const atForms = allContributions(points, modules, "slot").filter(
		({ point }) => point.kind === "form",
	);
	const partImports = [
		...new Set(
			atForms.map(
				({ module, point }) =>
					`import type ${partName(module, point.id)} from "#modules/${module.id}/${fileOf(contributionKinds.part, point.id)}";`,
			),
		),
	];
	const names = [
		...listed.flatMap(({ list }) => [`type ${list.type}`, list.call]),
		...(atForms.length ? ["formSlotContribution"] : []),
	];
	const bare = (name: string) => name.replace(/^type /, "");
	const call = (
		{ row, list }: (typeof listed)[number],
		{ module, contribution, point }: (typeof listed)[number]["all"][number],
	) => {
		const args = [
			pointRef(point),
			JSON.stringify(module.id),
			...("named" in row ? [JSON.stringify(contribution.name)] : []),
			`() => import("#modules/${module.id}/${contribution.file}")`,
		].join(", ");
		return point.kind === "form"
			? `formSlotContribution<typeof ${pointRef(point)}, typeof ${partName(module, point.id)}>(${args})`
			: `${list.call}(${args})`;
	};
	const sources = kindRows
		.filter(([, row]) => !row.folder.startsWith("server/"))
		.map(([, row]) => `src/modules/*/${row.folder}`);

	return [
		`// ${GENERATED} from ${inWords(sources)}. Don't edit.`,
		`import {`,
		...names
			.toSorted(
				(a, b) => byName(bare(a).toLowerCase(), bare(b).toLowerCase()) || byName(bare(a), bare(b)),
			)
			.map((name) => `\t${name},`),
		`} from "#lib/extensions/define.ts";`,
		...pointImports(listed.flatMap(({ all }) => all.map(({ point }) => point))),
		...partImports,
		...listed.flatMap((kind) => [
			"",
			`/** ${kind.row.what}, in registry order. */`,
			`export const ${kind.list.name}: readonly ${kind.list.type}[] = ${listOf(
				kind.all.map((entry) => call(kind, entry)),
			)};`,
		]),
		"",
	].join("\n");
}

/**
 * `src/lib/server/lists/columns.gen.ts`: the SQL of the columns the modules add to lists
 * (`server/columns/<point id>.ts`), in registry order, for `withModuleColumns()`. Server-only, and
 * imported statically: the server merges a tenant's columns while it plans the list.
 */
export function renderColumnSql(points: ExtensionPoint[], modules: ModuleFolder[]): string {
	const columns = allContributions(points, modules, "columns");
	const sqlName = (module: ModuleFolder, point: string) =>
		`${module.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}${localName(`.${point}`)}`;
	return [
		`// ${GENERATED} from src/modules/*/${contributionKinds.sql.folder}. Don't edit.`,
		`import type { ColumnSqlContribution } from "./column-sql.ts";`,
		...pointImports(columns.map(({ point }) => point)),
		...columns.map(
			({ module, contribution }) =>
				`import ${sqlName(module, contribution.point)} from "#modules/${module.id}/${fileOf(contributionKinds.sql, contribution.point)}";`,
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
	const parts = allContributions(points, modules, "part");
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
		`// ${GENERATED} from src/modules/*/${contributionKinds.part.folder}. Don't edit.`,
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
