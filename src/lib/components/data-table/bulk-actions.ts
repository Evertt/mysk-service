/**
 * Bulk actions on a data table's selected rows: what a table declares (`BulkAction`), what its
 * remote command gets (`BulkTarget`) and answers (`BulkResult`), and the pure rules the action bar
 * (`bulk-action-bar.svelte`) follows: which selected rows an action applies to, and how a result
 * reads.
 *
 * Each action's command runs on the server (see `#lib/server/lists/bulk.ts`): it checks every record
 * again, with the same rules as the single-record path, and changes each one in a transaction of
 * its own, so one that's refused doesn't hold up the others. The result says what was done and
 * what was skipped, and why.
 */
import type { Component } from "svelte";

import { formatNumber } from "#lib/format.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ListColumns, ListWhere } from "./list-definition.ts";

/** The most records a bulk action changes at once. */
export const MAX_BULK_RECORDS = 500;

/** The `where` of any server-side list (`ListWhere`), for code that handles several lists. */
export type AnyListWhere = ListWhere<ListColumns>;

/**
 * What a bulk command acts on: the selected rows by id, or (in a server-side list, whose
 * actions say its `Where`, e.g. `AnyListWhere`) all the rows matching the list's search and
 * filters, as the `where` of the rows' query says. The server reads either within the current
 * tenant only. A client-side table's actions leave `Where` out and only get ids.
 */
export type BulkTarget<Where = never> =
	| { ids: number[] }
	| ([Where] extends [never] ? never : { matching: Where });

/** A record a bulk action left as it was, and why. */
interface BulkSkip {
	/** What the record is known by, e.g. an order's number. */
	label: string;
	reason: string;
}

/** What a bulk command did. */
export interface BulkResult {
	/** How many records it changed (or that were already as asked). */
	done: number;
	/** The records it refused to change, with the reason. */
	skipped: BulkSkip[];
	/** How many ids it didn't find (deleted meanwhile, or not the tenant's). */
	missing: number;
	/** A page to open afterwards, e.g. the invoice it created. */
	href?: string;
}

/** A choice in an action's parameter, e.g. an engineer to assign. */
interface BulkOption {
	value: string;
	label: string;
}

/** A translated text: a message function, read when shown. */
type Text = () => string;

export interface BulkAction<TData, Where = never> {
	id: string;
	label: Text;
	icon?: Component;
	/** Deletes or otherwise can't be undone: shown in red. */
	destructive?: boolean;
	/**
	 * Why the action doesn't apply to a selected row (e.g. "ORD-… is invoiced"), or `undefined` if
	 * it does. Only a hint: the server checks every record again, and reports those it skips.
	 */
	skip?: (row: TData) => string | undefined;
	/** Why the action can't run for this selection at all, e.g. orders of several customers. */
	disabled?: (rows: TData[]) => string | undefined;
	/**
	 * Whether it can act on all the rows matching a server-side table's filters, not only the
	 * selected ones (default `true`). Actions that check the selection as a whole can't.
	 */
	matching?: boolean;
	/** Asks before running, e.g. before deleting. */
	confirm?: { title: (count: number) => string; description: Text };
	/** A value to choose first, e.g. the engineer to assign, in a dialog. */
	parameter?: {
		label: Text;
		/** The choices, loaded when the dialog opens. */
		options: () => BulkOption[] | Promise<BulkOption[]>;
		title: (count: number) => string;
		description?: Text;
	};
	/** Calls the action's remote command. */
	run: (target: BulkTarget<Where>, value?: string) => Promise<BulkResult>;
	/** What it did, e.g. `m.common_bulk_updated` ("3 updated"); updated by default. */
	done?: (inputs: { count: string }) => string;
}

/** Which selected rows an action applies to, and why it can't run, if it can't. */
export interface Applicability<TData> {
	applies: TData[];
	skipped: { row: TData; reason: string }[];
	/** Why it's disabled, if it is. */
	disabled?: string;
}

/**
 * Which of the selected `rows` an action applies to. It's disabled, with the reason, when the
 * selection as a whole rules it out, when none of the rows apply (with the first row's reason), or
 * when it can't act on all matching rows and those are selected (`allMatching`).
 */
export function applicability<TData>(
	action: Pick<BulkAction<TData>, "skip" | "disabled" | "matching">,
	rows: TData[],
	allMatching = false,
): Applicability<TData> {
	if (allMatching && action.matching === false) {
		return { applies: [], skipped: [], disabled: m.common_bulk_not_for_all_matching() };
	}
	const applies: TData[] = [];
	const skipped: { row: TData; reason: string }[] = [];
	for (const row of rows) {
		const reason = action.skip?.(row);
		if (reason === undefined) applies.push(row);
		else skipped.push({ row, reason });
	}
	// Among all the matching rows, others than those shown may apply.
	const disabled =
		action.disabled?.(rows) ?? (!allMatching && !applies.length ? skipped[0]?.reason : undefined);
	return { applies, skipped, disabled };
}

/** How many reasons for skipping a result lists; the rest are counted. */
const LISTED_SKIPS = 5;

export interface BulkSummary {
	/** `success` if everything was done, `warning` if some was, `error` if nothing was. */
	tone: "success" | "warning" | "error";
	/** E.g. "7 updated, 2 skipped". */
	title: string;
	/** Why records were skipped, one per record, e.g. "ORD-2026-00012 is invoiced". */
	details: string[];
}

/**
 * How a bulk action's result reads, e.g. "7 updated, 2 skipped" with the reasons. `done` says what
 * was done (by default "… updated").
 */
export function summarizeBulkResult(
	result: BulkResult,
	done: (inputs: { count: string }) => string = m.common_bulk_updated,
): BulkSummary {
	const skipped = result.skipped.length;
	const parts = [
		result.done || (!skipped && !result.missing) ? done({ count: formatNumber(result.done) }) : "",
		skipped ? m.common_bulk_skipped({ count: formatNumber(skipped) }) : "",
		result.missing ? m.common_bulk_missing({ count: formatNumber(result.missing) }) : "",
	].filter(Boolean);
	const details = result.skipped
		.slice(0, LISTED_SKIPS)
		.map(({ label, reason }) =>
			reason.includes(label) ? reason : m.common_bulk_skip_reason({ label, reason }),
		);
	if (skipped > LISTED_SKIPS) {
		details.push(m.common_bulk_more({ count: formatNumber(skipped - LISTED_SKIPS) }));
	}
	const tone = !skipped && !result.missing ? "success" : result.done ? "warning" : "error";
	return { tone, title: parts.join(", "), details };
}
