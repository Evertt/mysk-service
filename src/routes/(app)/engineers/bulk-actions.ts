/** The engineers list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import UserRoundCheckIcon from "@lucide/svelte/icons/user-round-check";
import UserRoundXIcon from "@lucide/svelte/icons/user-round-x";

import type { BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import { m } from "#lib/paraglide/messages.js";

import type { EngineerRow } from "./columns.ts";
import { bulkSetEngineersActive } from "./engineers.remote.ts";

export const activate: BulkAction<EngineerRow> = {
	id: "activate",
	label: m.engineers_bulk_activate,
	icon: UserRoundCheckIcon,
	skip: (row) => (row.active ? m.engineers_bulk_already_active({ name: row.name }) : undefined),
	run: (target) => bulkSetEngineersActive({ target, active: true }),
};

export const deactivate: BulkAction<EngineerRow> = {
	id: "deactivate",
	label: m.engineers_bulk_deactivate,
	icon: UserRoundXIcon,
	skip: (row) => (row.active ? undefined : m.engineers_bulk_already_inactive({ name: row.name })),
	run: (target) => bulkSetEngineersActive({ target, active: false }),
};
