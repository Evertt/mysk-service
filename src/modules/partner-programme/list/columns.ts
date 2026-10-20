import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import { CustomerLink } from "#lib/customers/components.ts";

import LevelBadge from "../ui/level-badge.svelte";
import LevelProgress from "../ui/level-progress.svelte";
import { partnersList } from "./partners-list.ts";
import type { getPartners } from "./partners.remote.ts";

/** A row of the partners list, a page of which comes from the server (see `partnersList`). */
type PartnerRow = Awaited<ReturnType<typeof getPartners>>["rows"][number];

const column = createAppColumnHelper<PartnerRow>();

export const columns = withListColumns(partnersList, {
	partner: column.accessor((row) => row.customer.name, {
		id: "partner",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				name: row.original.customer.name,
				code: row.original.customer.code,
				withCode: true,
			}),
		enableHiding: false,
		meta: { label: m.partners_column_partner },
	}),
	// By the level's name; `none` is the partners below the first.
	level: column.accessor((row) => row.level ?? undefined, {
		id: "level",
		cell: ({ row }) =>
			renderComponent(LevelBadge, { level: row.original.level, colour: row.original.colour }),
		meta: { label: m.partners_column_level, none: m.partners_no_level },
	}),
	revenue: column.accessor("revenue", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.partners_partner_revenue },
	}),
	progress: column.display({
		id: "progress",
		cell: ({ row }) =>
			renderComponent(LevelProgress, {
				revenue: row.original.revenue,
				progress: row.original.progress,
				compact: true,
			}),
		meta: { label: m.partners_column_progress },
	}),
	wallet: column.accessor("wallet", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.partners_column_wallet },
	}),
	accepted: column.accessor("acceptedOn", {
		id: "accepted",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.partners_column_accepted },
	}),
});
