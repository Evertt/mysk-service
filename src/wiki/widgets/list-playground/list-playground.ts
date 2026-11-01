/**
 * The logic of `<ListPlayground>`: 25 fixture rows shaped like the orders list, and what a search,
 * a status filter and grouping by status make of them. The search is the lists' rule
 * (`searchWords()` from the list kit): each word of the search is in one of the searched columns,
 * in any case. The sites are message functions (the customers are names), read where they are
 * shown and searched.
 */
import { searchWords } from "#lib/components/data-table/search-words.ts";
import { type OrderStatus, orderStatuses } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";

export interface PlaygroundRow {
	id: number;
	number: string;
	customer: string;
	site: () => string;
	status: OrderStatus;
	/** A day, `yyyy-mm-dd`; none until the order is planned. */
	scheduledFor: string | null;
}

const customers = [
	["Harbour Café", m.wiki_list_site_quay_4],
	["Northgate Logistics", m.wiki_list_site_depot_2],
	["Pier 9 Cold Storage", m.wiki_list_site_hall_a],
	["Southfield School", m.wiki_list_site_main_building],
	["Valley Dairy", m.wiki_list_site_milking_shed],
	["Riverside Garden Centre", m.wiki_list_site_greenhouse],
	["Beacon Hotel", m.wiki_list_site_kitchen],
	["Millstone Bakery", m.wiki_list_site_ovens],
	["Linden Care Home", m.wiki_list_site_east_wing],
	["Ironside Foundry", m.wiki_list_site_casting_floor],
] as const;

const statuses: readonly OrderStatus[] = [
	"awaiting_acceptance",
	"quote",
	"scheduled",
	"scheduled",
	"in_progress",
	"completed",
	"completed",
	"invoiced",
	"scheduled",
	"cancelled",
	"completed",
	"quote",
	"in_progress",
];

/** 25 orders, made up: every status at least once, a few customers more than once. */
export const fixtureRows: readonly PlaygroundRow[] = Array.from({ length: 25 }, (_, index) => {
	const id = index + 1;
	const [customer, site] = customers[(index * 3) % customers.length];
	const status = statuses[(index * 5) % statuses.length];
	const planned = status !== "awaiting_acceptance" && status !== "quote";
	return {
		id,
		number: `ORD-2026-${String(id).padStart(5, "0")}`,
		customer,
		site,
		status,
		scheduledFor: planned ? `2026-11-${String(1 + ((index * 7) % 28)).padStart(2, "0")}` : null,
	};
});

export interface PlaygroundState {
	search?: string;
	status?: OrderStatus;
	grouped?: boolean;
}

interface PlaygroundGroup {
	/** The group's status; `null` for the one group of a list that isn't grouped. */
	status: OrderStatus | null;
	rows: PlaygroundRow[];
}

/** The rows a search keeps: each of its words is in one of the row's searched columns. */
function matches(row: PlaygroundRow, words: readonly string[]) {
	const text = `${row.number} ${row.customer} ${row.site()}`.toLowerCase();
	return words.every((word) => text.includes(word.toLowerCase()));
}

/**
 * What the table shows for `state`: the rows that pass the search and the status filter, in one
 * group, or when grouped a group per status present, in the lifecycle's order. `total` counts the
 * rows shown.
 */
export function playground(
	rows: readonly PlaygroundRow[],
	{ search = "", status, grouped = false }: PlaygroundState,
): { groups: PlaygroundGroup[]; total: number } {
	const words = searchWords(search);
	const kept = rows.filter((row) => matches(row, words) && (!status || row.status === status));
	if (!grouped) return { groups: [{ status: null, rows: kept }], total: kept.length };
	const groups = orderStatuses
		.map((group) => ({ status: group, rows: kept.filter((row) => row.status === group) }))
		.filter((group) => group.rows.length > 0);
	return { groups, total: kept.length };
}
