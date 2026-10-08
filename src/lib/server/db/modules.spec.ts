/**
 * Keeps the modules' tables where they belong: they reference the core's tables, never the other
 * way round, and no two tables have the same name (core or module), so a module can be deleted
 * along with its tables.
 */
import { getTableName, is } from "drizzle-orm";
import {
	foreignKey,
	integer,
	SQLiteTable,
	sqliteTable,
	getTableConfig,
} from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vite-plus/test";

import * as moduleSchema from "./modules.gen.ts";
import * as coreSchema from "./schema.ts";

const tablesOf = (schema: Record<string, unknown>) =>
	Object.values(schema).filter((value): value is SQLiteTable => is(value, SQLiteTable));

/** The tables in `from` that have a foreign key to one of the tables in `targets`. */
function referencing(from: SQLiteTable[], targets: SQLiteTable[]) {
	return from.flatMap((table) =>
		getTableConfig(table).foreignKeys.flatMap((key) =>
			targets.includes(key.reference().foreignTable)
				? [`${getTableName(table)} → ${getTableName(key.reference().foreignTable)}`]
				: [],
		),
	);
}

const duplicates = (names: string[]) => names.filter((name, i) => names.indexOf(name) !== i);

describe("the checks", () => {
	const core = sqliteTable("core", { id: integer("id").primaryKey() });
	const extra = sqliteTable(
		"extra",
		{ id: integer("id").primaryKey(), coreId: integer("core_id") },
		(table) => [foreignKey({ columns: [table.coreId], foreignColumns: [core.id] })],
	);
	const back = sqliteTable(
		"back",
		{ id: integer("id").primaryKey(), extraId: integer("extra_id") },
		(table) => [foreignKey({ columns: [table.extraId], foreignColumns: [extra.id] })],
	);

	test("find a foreign key from one set of tables to another", () => {
		expect(referencing([extra], [core])).toEqual(["extra → core"]);
		expect(referencing([back], [extra])).toEqual(["back → extra"]);
		expect(referencing([core], [extra])).toEqual([]);
	});

	test("find a name used twice", () => {
		expect(duplicates(["a", "b", "a"])).toEqual(["a"]);
	});
});

describe("the modules' tables", () => {
	const core = tablesOf(coreSchema);
	const modules = tablesOf(moduleSchema);

	test("are not referenced by a foreign key of a core table", () => {
		expect(referencing(core, modules)).toEqual([]);
	});

	test("have names of their own", () => {
		expect(duplicates([...core, ...modules].map(getTableName))).toEqual([]);
	});

	test("have export names of their own", () => {
		// `export *` drops a name both files export without saying so.
		const coreNames = Object.keys(coreSchema);
		expect(Object.keys(moduleSchema).filter((name) => coreNames.includes(name))).toEqual([]);
	});
});
