/**
 * The columns modules add to a core list, on the server (see
 * `#lib/components/data-table/module-columns.ts`): the list's `ListSql` factory passes its SQL
 * through `withModuleColumns()`, which adds those of the current tenant's modules (their SQL comes
 * from `columns.gen.ts`, made with `columnSql()` in `./column-sql.ts`):
 *
 * ```ts
 * export const equipmentSql = (): ListSql<typeof equipmentList.columns> =>
 * 	withModuleColumns({ list: equipmentList, from: …, columns: { … }, … });
 * ```
 *
 * `planList()` then checks the query against the merged list (a 400 for a column the tenant doesn't
 * have), and sorts and filters by the modules' columns as by the list's own.
 *
 * Not in the folder's barrel: it imports the registry, which imports the modules' column files,
 * which import the barrel. Import it by its path, `#lib/server/lists/module-columns.ts`.
 */
import { extendList } from "#lib/components/data-table/list-definition.ts";
import { checkModuleColumn } from "#lib/components/data-table/module-columns.ts";
import { requireTenant } from "#lib/server/auth/session.ts";

import type { ColumnSqlContribution } from "./column-sql.ts";
import { generatedColumnSql } from "./columns.gen.ts";
import type { ListSql } from "./plan.ts";

/**
 * `listSql` with the columns of the `enabled` modules (by default the current tenant's) that add
 * columns to its list (`ListDef.moduleColumns`), in registry order: their SQL among its columns,
 * their values and facets in `modules`, and the list merged with their definitions
 * (`extendList()`). A list without a point, or a tenant without such modules, gets `listSql` as it
 * is. Call it in the list's `ListSql` factory, per request.
 */
export function withModuleColumns<C>(
	listSql: ListSql<C>,
	enabled: readonly string[] = requireTenant().modules,
	registry: readonly ColumnSqlContribution[] = generatedColumnSql(),
): ListSql<C> {
	const point = listSql.list.point;
	if (!point) return listSql;
	const added = registry
		.filter((entry) => entry.point.id === point.id && enabled.includes(entry.module))
		.flatMap((entry) =>
			entry.columns.map((column) => {
				checkModuleColumn(column.column, entry.module);
				return { column: column.column, ...column.sql() };
			}),
		);
	if (!added.length) return listSql;
	return {
		...listSql,
		list: extendList(
			listSql.list,
			added.map((entry) => entry.column),
		),
		columns: {
			...listSql.columns,
			...Object.fromEntries(
				added.map(({ column, sort, nullsLast, filter }) => [
					column.id,
					{
						...(sort ? { sort } : {}),
						...(nullsLast ? { nullsLast } : {}),
						...(filter ? { filter } : {}),
					},
				]),
			),
		},
		modules: Object.fromEntries(
			added.map(({ column, value, facet }) => [column.id, { value, ...(facet ? { facet } : {}) }]),
		),
	};
}
