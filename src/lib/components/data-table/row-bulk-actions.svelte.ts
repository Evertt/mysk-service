/**
 * The bridge between a table's action bar and its rows' menus: the bar (`bulk-action-bar.svelte`)
 * offers its actions here, and each row's menu (`row-actions.svelte`) offers those that apply to
 * its row and asks the bar to run one on it, so the bar's dialog, result toast and refreshes serve
 * a single row too. `createAppTable` sets one up for every table it makes; a table without an
 * action bar offers none.
 */
import { createContext } from "svelte";

import type { BulkAction } from "./bulk-actions.ts";

/** A row to run an action on: its id (the table's row id, a record id), record and label. */
export interface BulkRow {
	id: string;
	original: unknown;
	label: string;
}

/** What the action bar offers the rows: its actions, and running one on a single row. */
interface RowActionsProvider {
	readonly actions: BulkAction<unknown, unknown>[];
	start: (action: BulkAction<unknown, unknown>, row: BulkRow) => void;
}

class RowBulkActions {
	#provider = $state.raw<RowActionsProvider>();

	/** The table's bulk actions, if it has an action bar. */
	get actions(): BulkAction<unknown, unknown>[] {
		return this.#provider?.actions ?? [];
	}

	/** Runs `action` on `row` alone (asking first, as on a selection, if the action asks). */
	start(action: BulkAction<unknown, unknown>, row: BulkRow) {
		this.#provider?.start(action, row);
	}

	/** The action bar offers its actions, until the returned function withdraws them. */
	provide(provider: RowActionsProvider) {
		this.#provider = provider;
		return () => {
			if (this.#provider === provider) this.#provider = undefined;
		};
	}
}

const [getBridge, setBridge, hasBridge] = createContext<RowBulkActions>();

/** Sets up the bridge for a table's components; call it while the table's component initializes. */
export const setRowBulkActions = () => setBridge(new RowBulkActions());

/** The table's bridge, if the component is in a table made by `createAppTable`. */
export const getRowBulkActions = () => (hasBridge() ? getBridge() : undefined);
