/**
 * The columns the current tenant's modules add to a core list (see
 * `#lib/components/data-table/module-columns.ts`), loaded from the modules that have them: the
 * list's page merges them into the list (`extendList()`) before it reads the URL, and its table
 * shows them (`withModuleTableColumns()`). A tenant without such modules gets none, and loads none
 * of their code.
 */
import { getCurrentTenant } from "#lib/auth/session.remote.ts";
import {
	checkModuleColumn,
	type ModuleListColumn,
} from "#lib/components/data-table/module-columns.ts";
import { columnContributions } from "#lib/extensions/contributions.gen.ts";
import type { ColumnsContribution, ListColumnsPoint } from "#lib/extensions/define.ts";

/**
 * The columns that the `modules` (by default the current tenant's) add to `point`'s list, in
 * registry order. `registry` is for specs.
 */
export async function loadListColumns(
	point: ListColumnsPoint,
	modules?: readonly string[],
	registry: readonly ColumnsContribution[] = columnContributions,
): Promise<ModuleListColumn[]> {
	const enabled = modules ?? (await getCurrentTenant()).modules;
	const loaded = await Promise.all(
		registry
			.filter((entry) => entry.point === point.id && enabled.includes(entry.module))
			.map(async ({ module, load }) =>
				(await load()).default.map((column) => {
					checkModuleColumn(column, module);
					return column;
				}),
			),
	);
	return loaded.flat();
}
