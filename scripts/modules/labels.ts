import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSync } from "vite-plus";

import { GENERATED, type ModuleFolder, walk } from "./shared.ts";

/**
 * A kind of label (`orderStatus`), from an enum array tagged `@labels orderStatus` in its doc
 * comment: `const orderStatuses = ["quote", …] as const`, with its exported type alias
 * `type OrderStatus = (typeof orderStatuses)[number]`. One array can name several kinds (`@labels
 * memberRole memberRoleDescription`): each gets its own messages.
 */
export interface LabelKind {
	kind: string;
	values: string[];
	/** The array's exported type alias, which the generated map is held to. */
	type: string;
	/** The file that declares it, relative to its owner's folder, with `/`. */
	file: string;
}

/** The pieces of oxc's AST this reads. */
interface Node {
	type: string;
	start: number;
	end: number;
	[key: string]: unknown;
}
const child = (node: unknown, key: string) => (node as Record<string, Node | null>)[key];

const KIND = /^[a-z][a-zA-Z0-9]*$/;

/** The snake_case of a kind or value in a message key: `orderStatus` → `order_status`, `30-days` → `30_days`. */
const snake = (name: string) =>
	name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replaceAll("-", "_");

/**
 * The message of a value of a kind: `<prefix>_<kind>_<value>` in snake_case, e.g.
 * `enum_order_status_in_progress` (the core's prefix is `enum`) or
 * `contracts_enum_contract_level_basic` (a module's is `<its message section>_enum`).
 */
export const labelKey = (prefix: string, kind: string, value: string) =>
	`${prefix}_${snake(kind)}_${snake(value)}`;

/** The label kinds `file` (relative to its owner's folder) declares, and what's wrong with its tags. */
export function findLabelKinds(file: string, source: string) {
	const kinds: LabelKind[] = [];
	const problems: string[] = [];
	if (!source.includes("@labels")) return { kinds, problems };

	const { program, comments, errors } = parseSync(file, source, { sourceType: "module" });
	if (errors.length) return { kinds, problems: [`${file}: ${errors[0].message}`] };
	const statements = program.body as unknown as Node[];

	// The arrays' type aliases: `export type X = (typeof xs)[number]`.
	const typeOf = new Map<string, string>();
	for (const statement of statements) {
		const alias = statement.type === "ExportNamedDeclaration" && child(statement, "declaration");
		if (!alias || alias.type !== "TSTypeAliasDeclaration") continue;
		let type = child(alias, "typeAnnotation");
		if (type?.type !== "TSIndexedAccessType") continue;
		if (child(type, "indexType")?.type !== "TSNumberKeyword") continue;
		type = child(type, "objectType");
		if (type?.type === "TSParenthesizedType") type = child(type, "typeAnnotation");
		const array = type?.type === "TSTypeQuery" && child(type, "exprName");
		if (array && array.type === "Identifier") {
			typeOf.set(array.name as string, child(alias, "id")!.name as string);
		}
	}

	for (const comment of comments) {
		// A line of its own (`* @labels orderStatus`), so prose may mention the tag.
		const tag = /(?:^|\n)[\s*]*@labels\b([^\n*]*)/.exec(comment.value);
		if (comment.type !== "Block" || !tag) continue;
		const line = source.slice(0, comment.start).split("\n").length;
		const where = `${file}:${line}`;
		const statement = statements.find(
			(node) => node.start >= comment.end && !source.slice(comment.end, node.start).trim(),
		);
		const declaration =
			statement?.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
		const declarator =
			declaration?.type === "VariableDeclaration" &&
			(declaration.declarations as Node[]).length === 1
				? (declaration.declarations as Node[])[0]
				: undefined;
		const init = declarator && child(declarator, "init");
		const array = init?.type === "TSAsExpression" ? child(init, "expression") : undefined;
		const elements = array?.type === "ArrayExpression" ? (array.elements as Node[]) : [];
		const isConst =
			init?.type === "TSAsExpression" && child(child(init, "typeAnnotation"), "typeName")?.name;
		if (
			!declarator ||
			isConst !== "const" ||
			!elements.length ||
			!elements.every((element) => element?.type === "Literal" && typeof element.value === "string")
		) {
			problems.push(`${where}: @labels tags a \`const xs = ["a", "b"] as const\` of strings.`);
			continue;
		}
		const name = child(declarator, "id")!.name as string;
		const type = typeOf.get(name);
		if (!type) {
			problems.push(`${where}: @labels needs \`export type X = (typeof ${name})[number]\`.`);
			continue;
		}
		const names = tag[1].trim().split(/\s+/).filter(Boolean);
		if (!names.length)
			problems.push(`${where}: @labels names the kinds, e.g. \`@labels orderStatus\`.`);
		for (const kind of names) {
			if (!KIND.test(kind)) {
				problems.push(`${where}: a label kind is camelCase, like \`orderStatus\`: ${kind}.`);
				continue;
			}
			kinds.push({ kind, values: elements.map((element) => element.value as string), type, file });
		}
	}
	return { kinds, problems };
}

/** Who has label kinds: the core (`src/lib`) or a module. */
export interface LabelOwner {
	/** Its folder, relative to the root: `src/lib` or `src/modules/<id>`. */
	dir: string;
	/** Its messages' prefix: `enum` for the core, `<section>_enum` for a module (none without messages). */
	prefix: string | undefined;
	/** How the generated file imports a file of the owner's (`./model.ts`, `#lib/models.ts`). */
	specifier: (file: string) => string;
	/** Where the generated file is, relative to the root. */
	output: string;
	/** Where `Labels` comes from. */
	labelsFrom: string;
}

/** The generated `labels.gen.ts` of an owner with these kinds. */
export function renderLabels(owner: LabelOwner & { prefix: string }, kinds: LabelKind[]) {
	const types = new Map<string, Set<string>>();
	for (const { file, type } of kinds) types.set(file, (types.get(file) ?? new Set()).add(type));
	const key = (value: string) => (/^[A-Za-z_$][\w$]*$/.test(value) ? value : JSON.stringify(value));
	return [
		`// ${GENERATED} from the arrays tagged \`@labels\` in ${owner.dir}. Don't edit.`,
		`import type { Labels } from "${owner.labelsFrom}";`,
		`import { m } from "#lib/paraglide/messages.js";`,
		"",
		...[...types].map(
			([file, names]) =>
				`import type { ${[...names].toSorted().join(", ")} } from "${owner.specifier(file)}";`,
		),
		"",
		"/** Each kind's values' messages, `label()` and friends read them (see `#lib/i18n/labels.ts`). */",
		"export const labels = {",
		...kinds.flatMap(({ kind, values, type }) => [
			`\t${kind}: {`,
			...values.map((value) => `\t\t${key(value)}: m.${labelKey(owner.prefix, kind, value)},`),
			`\t} satisfies Labels<${type}>,`,
		]),
		"};",
		"",
	].join("\n");
}

/** The `.ts` files under `dir` (relative to it) that may declare label kinds. */
const sources = (dir: string) =>
	walk(dir).filter(
		(file) =>
			file.endsWith(".ts") &&
			!file.endsWith(".gen.ts") &&
			!file.endsWith(".d.ts") &&
			!/(^|\/)(tests|paraglide)\//.test(file) &&
			!file.startsWith("components/ui/"),
	);

/**
 * The label maps the generator writes, by path relative to the root: the core's
 * (`src/lib/i18n/labels.gen.ts`) and each module's that tags arrays (`src/modules/<id>/labels.gen.ts`);
 * and what's wrong with the tags.
 */
export function planLabels(root: string, modules: ModuleFolder[]) {
	const files: Record<string, string> = {};
	const problems: string[] = [];
	const owners: LabelOwner[] = [
		{
			dir: "src/lib",
			prefix: "enum",
			specifier: (file) => `#lib/${file}`,
			output: "src/lib/i18n/labels.gen.ts",
			labelsFrom: "./labels.ts",
		},
	];
	for (const module of modules) {
		// Its section named after it, or its only one.
		const sections = Object.values(module.messages)[0] ?? [];
		const section = sections.includes(module.id) ? module.id : sections[0];
		owners.push({
			dir: `src/modules/${module.id}`,
			prefix: section && `${section}_enum`,
			specifier: (file) => `./${file}`,
			output: `src/modules/${module.id}/labels.gen.ts`,
			labelsFrom: "#lib/i18n/index.ts",
		});
	}

	for (const owner of owners) {
		const dir = join(root, owner.dir);
		const kinds: LabelKind[] = [];
		for (const file of existsSync(dir) ? sources(dir) : []) {
			const found = findLabelKinds(file, readFileSync(join(dir, file), "utf8"));
			kinds.push(...found.kinds);
			problems.push(...found.problems.map((problem) => `${owner.dir}/${problem}`));
		}
		if (!kinds.length) continue;
		const seen = new Set<string>();
		for (const { kind } of kinds) {
			if (seen.has(kind)) problems.push(`${owner.dir}: two arrays name the label kind ${kind}.`);
			seen.add(kind);
		}
		if (!owner.prefix) {
			problems.push(`${owner.dir} tags arrays with @labels but has no messages for them.`);
			continue;
		}
		files[owner.output] = renderLabels({ ...owner, prefix: owner.prefix }, kinds);
	}
	return { files, problems };
}
