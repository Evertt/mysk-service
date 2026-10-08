/**
 * The bulk actions the current tenant's modules add to a core table's selection (see
 * `bulkActions` in `#lib/modules.ts`), e.g. invoicing's "Create invoice" on the orders list. They
 * load after the table, so `current` is empty at first (and for a tenant without such modules).
 */
import { bulkActionLoaders, type BulkTableName, type TableBulkAction } from "#lib/modules.js";

import { getCurrentTenant } from "./session.remote.js";

/** Call it while the table's component initializes. */
export function moduleBulkActions<Table extends BulkTableName>(table: Table) {
	let actions = $state.raw<TableBulkAction<Table>[]>([]);
	$effect(() => {
		let current = true;
		void (async () => {
			const { modules } = await getCurrentTenant();
			const loaded = await Promise.all(
				bulkActionLoaders(table, modules).map(async (load) => (await load()).default),
			);
			if (current) actions = loaded.flat();
		})();
		return () => {
			current = false;
		};
	});
	return {
		get current() {
			return actions;
		},
	};
}
