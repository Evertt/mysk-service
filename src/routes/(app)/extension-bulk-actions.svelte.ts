/**
 * The bulk actions the current tenant's modules add to a core table's selection (the table is a
 * `defineBulkTable()` of `#lib/extensions/define.ts`, listed in
 * `#lib/extensions/contributions.gen.ts`), e.g. invoicing's "Create invoice" on the orders list.
 * They load after the table, so `current` is empty at first (and for a tenant without such modules).
 */
import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import { bulkContributions } from "#lib/extensions/contributions.gen.ts";
import type { BulkContribution, BulkTable } from "#lib/extensions/define.ts";

import { getCurrentTenant } from "./session.remote.ts";

/** Call it while the table's component initializes. */
export function extensionBulkActions<Row>(table: BulkTable<Row>) {
	let actions = $state.raw<BulkAction<Row, AnyListWhere>[]>([]);
	$effect(() => {
		let current = true;
		void (async () => {
			const { modules } = await getCurrentTenant();
			const loaded = await Promise.all(
				bulkContributions
					.filter((entry) => entry.point === table.id && modules.includes(entry.module))
					// A contribution to this table takes this table's rows (`bulkContribution()`).
					.map(async ({ load }) => (await (load as BulkContribution<Row>["load"])()).default),
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
