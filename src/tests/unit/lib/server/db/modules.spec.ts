/**
 * Keeps the modules' tables where they belong: they reference the core's tables and those of the
 * modules they require, never the other way round, and no two tables have the same name (core or
 * module), so a module can be deleted along with its tables.
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

import type { ModuleGraph } from "#lib/modules/graph.ts";
import { moduleGraph } from "#lib/modules/ids.ts";
import { moduleSchemas } from "#lib/server/db/module-schemas.gen.ts";
import * as moduleSchema from "#lib/server/db/modules.gen.ts";
import * as coreSchema from "#lib/server/db/schema.ts";

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

/**
 * The foreign keys of a module's tables to tables that neither the core nor a module it requires
 * owns, as `module: table → foreign`. `schemas` are the modules' exports by id.
 */
function referencesBeyondRequires(
	schemas: Record<string, Record<string, unknown>>,
	core: SQLiteTable[],
	graph: ModuleGraph,
) {
	return Object.entries(schemas).flatMap(([id, schema]) => {
		const allowed = [
			...core,
			...(graph[id]?.requires ?? []).flatMap((required) => tablesOf(schemas[required] ?? {})),
		];
		const own = tablesOf(schema);
		return own.flatMap((table) =>
			getTableConfig(table).foreignKeys.flatMap((key) => {
				const foreign = key.reference().foreignTable;
				return own.includes(foreign) || allowed.includes(foreign)
					? []
					: [`${id}: ${getTableName(table)} → ${getTableName(foreign)}`];
			}),
		);
	});
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

	test("find a foreign key to a module that isn't required", () => {
		const graph = {
			a: { requires: [], enhances: [], alwaysOn: false },
			b: { requires: ["a"], enhances: [], alwaysOn: false },
			c: { requires: [], enhances: ["a"], alwaysOn: false },
		};
		const schemas = { a: { extra }, b: { back }, c: { back } };
		// `extra` references the core's table, `back` references `extra`, which only `b` requires.
		expect(referencesBeyondRequires({ a: schemas.a }, [core], graph)).toEqual([]);
		expect(referencesBeyondRequires(schemas, [core], graph)).toEqual(["c: back → extra"]);
		expect(referencesBeyondRequires({ a: schemas.a, b: schemas.b }, [core], graph)).toEqual([]);
		expect(referencesBeyondRequires({ b: schemas.b }, [core], graph)).toEqual(["b: back → extra"]);
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

	test("reference only core tables and tables of modules they require", () => {
		expect(referencesBeyondRequires(moduleSchemas, core, moduleGraph)).toEqual([]);
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
