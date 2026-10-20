/**
 * One way to build a list, in either mode (`docs/agents/lists.md`): its definition (`defineList()`),
 * the table's columns from it (`withListColumns()`), its table (`createServerTable()` or
 * `createClientTable()`), its page's shell and toolbar (`ListLayout`, `ListToolbar`), and on the
 * server the rows query's answer (`plan.answer()`). These specs refuse the hand-written forms they
 * replace, which restated the definition and drifted from it. Each failure names the file and line.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The app's own code, without the tests. */
const appFiles = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
	.map((file) => `src/${file}`)
	.filter(
		(file) =>
			/\.(?:svelte|ts)$/.test(file) &&
			!file.startsWith("src/tests/") &&
			!/^src\/modules\/[^/]+\/tests\//.test(file) &&
			!file.endsWith(".gen.ts"),
	);

/** Where the list kit itself lives, which may use its own parts. */
const kit = ["src/lib/components/data-table/", "src/lib/server/lists/"];

/** A file's code without its comments (keeping their lines, so lines are counted right). */
const code = (file: string) =>
	readFileSync(join(root, file), "utf8").replace(
		/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<!:)\/\/.*$/gm,
		(comment) => comment.replace(/[^\n]/g, ""),
	);

/** `file:line` of every match of `pattern` in `files`. */
function offenders(files: readonly string[], pattern: RegExp) {
	return files.flatMap((file) => {
		const text = code(file);
		return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].map(
			(match) => `${file}:${text.slice(0, match.index).split("\n").length}`,
		);
	});
}

const outsideKit = appFiles.filter((file) => !kit.some((folder) => file.startsWith(folder)));

/** Uses of the kit's parts outside it that aren't a list's table, with why. */
const allowed: Record<string, string> = {
	"src/modules/checklists/assets/asset-list.svelte":
		"a server-side list of cards, not a table: it scrolls its pages with scrollPages()",
};

describe("a list's table", () => {
	test("is made from its definition: createServerTable() or createClientTable()", () => {
		expect(
			offenders(outsideKit, /\bcreateAppTable\(/),
			"use createServerTable() or createClientTable() with the list's defineList()",
		).toEqual([]);
	});

	test("wires no server-side table by hand", () => {
		const found = offenders(
			outsideKit.filter((file) => !(file in allowed)),
			/\b(?:scrollPages|serverTableLoading|urlListQuery|recordOptions)\(/,
		);
		expect(found, "createServerTable() wires the table, listQueries() the page").toEqual([]);
	});

	test("has its filters from the definition, in ListToolbar (or ListLayout)", () => {
		const found = offenders(
			outsideKit.filter((file) => file.endsWith(".svelte")),
			/<(?:FacetedFilter|RecordFilter|DateRangeFilter|NumberRangeFilter|table\.Toolbar|table\.Table)\b/,
		);
		expect(found, "use ListLayout, or ListToolbar, with `filters` for what's the page's").toEqual(
			[],
		);
	});

	test("has its columns from the definition: withListColumns(), without restating it", () => {
		const columnFiles = outsideKit.filter((file) => /createAppColumnHelper\b/.test(code(file)));
		expect(columnFiles.length).toBeGreaterThan(10);
		const unlisted = columnFiles.filter((file) => !/\bwithListColumns\(/.test(code(file)));
		expect(unlisted, "build a list's columns with withListColumns(list, { … })").toEqual([]);
		// What the definition says: sorting, grouping, the filter and its values, the URL's name.
		const restated = offenders(
			columnFiles,
			/\b(?:filterFn|enableSorting|enableGrouping|filterValues|filterNone|param):|\bfilter: "/,
		);
		expect(restated, "say it in the list's defineList()").toEqual([]);
	});

	test("the allowed files still use the kit's parts", () => {
		for (const file of Object.keys(allowed)) {
			expect(offenders([file], /\bscrollPages\(/), file).not.toEqual([]);
		}
	});
});

describe("a list's rows query", () => {
	test("answers with plan.answer(), with its groups", () => {
		const found = offenders(outsideKit, /\bqueryKey\(input\)|\bpageGroupsOf\(|\.paged\(/);
		expect(found, "return planList(…).answer(select, { enrich })").toEqual([]);
	});
});

describe("a list's page", () => {
	/** The components that show a list's table, by the name they're imported as. */
	const tables = appFiles
		.filter(
			(file) => file.endsWith(".svelte") && /\bcreate(?:Server|Client)Table\(/.test(code(file)),
		)
		.map((file) => ({
			file,
			name: file
				.split("/")
				.pop()!
				.replace(/\.svelte$/, "")
				.replace(/(?:^|-)(\w)/g, (_, letter: string) => letter.toUpperCase()),
		}));

	test("finds the list tables", () => {
		expect(tables.map((table) => table.name)).toEqual(
			expect.arrayContaining(["OrdersTable", "CustomersTable", "MaterialsTable"]),
		);
	});

	test("brings the table back as the member left it (loadTableMemory)", () => {
		const pages = appFiles.filter((file) => /^src\/routes\/.*\+page\.svelte$/.test(file));
		const missing = pages.filter((page) => {
			const source = code(page);
			if (!tables.some(({ name }) => new RegExp(`<${name}\\b`).test(source))) return false;
			const load = join(dirname(page), "+page.ts");
			return !appFiles.includes(load) || !/\bloadTableMemory\b/.test(code(load));
		});
		expect(missing, "give the page `export const load: Load = loadTableMemory`").toEqual([]);
	});

	test("of a module gets its table memory from the generator", () => {
		const own = appFiles.filter(
			(file) =>
				/^src\/modules\/[^/]+\/routes\/.*\+page\.ts$/.test(file) &&
				/\bloadTableMemory\b/.test(code(file)),
		);
		expect(own, "scripts/modules.ts emits a list page's +page.ts: delete this one").toEqual([]);
	});
});
