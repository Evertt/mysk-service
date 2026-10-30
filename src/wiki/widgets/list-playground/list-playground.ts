/**
 * The logic of `<ListPlayground>`: 25 fixture rows shaped like the orders list, and what a search,
 * a status filter and grouping by status make of them. The search is the lists' rule
 * (`searchWords()` from the list kit): each word of the search is in one of the searched columns,
 * in any case.
 */
import { searchWords } from "#lib/components/data-table/search-words.ts";
import { type OrderStatus, orderStatuses } from "#lib/models.ts";

export interface PlaygroundRow {
	id: number;
	number: string;
	customer: string;
	site: string;
	status: OrderStatus;
	/** A day, `yyyy-mm-dd`; none until the order is planned. */
	scheduledFor: string | null;
}

const customers = [
	["Harbour Café", "Quay 4"],
	["Northgate Logistics", "Depot 2"],
	["Pier 9 Cold Storage", "Hall A"],
	["Southfield School", "Main building"],
	["Valley Dairy", "Milking shed"],
	["Riverside Garden Centre", "Greenhouse"],
	["Beacon Hotel", "Kitchen"],
	["Millstone Bakery", "Ovens"],
	["Linden Care Home", "East wing"],
	["Ironside Foundry", "Casting floor"],
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
	const text = `${row.number} ${row.customer} ${row.site}`.toLowerCase();
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
