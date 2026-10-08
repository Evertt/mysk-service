import { SvelteSet } from "svelte/reactivity";

/**
 * Which groups of a grouped table (see `grouping.ts`) are collapsed: all expanded at first, each
 * toggled on its own, or all collapsed or expanded at once (also those on other pages). It's for
 * the grouped column only: grouping by another column expands them all again.
 */
export class GroupExpansion {
	#column = $state<string>();
	/** Whether groups are collapsed unless toggled, after "collapse all". */
	#collapsedAll = $state(false);
	/** The groups toggled from that. */
	#toggled = new SvelteSet<string>();

	/** Starts over for another column. */
	#for(column: string) {
		if (this.#column === column) return;
		this.#column = column;
		this.#collapsedAll = false;
		this.#toggled.clear();
	}

	/** Whether the group with this key, of the rows grouped by `column`, is collapsed. */
	isCollapsed(column: string, key: string) {
		return this.#column === column && this.#collapsedAll !== this.#toggled.has(key);
	}

	toggle(column: string, key: string) {
		this.#for(column);
		if (!this.#toggled.delete(key)) this.#toggled.add(key);
	}

	/** Collapses (or expands) every group. */
	setAll(column: string, collapsed: boolean) {
		this.#for(column);
		this.#collapsedAll = collapsed;
		this.#toggled.clear();
	}
}

const expansions = new WeakMap<object, GroupExpansion>();

/** Which of a table's groups are collapsed, shared by its parts (the rows and the View menu). */
export function groupExpansion(table: object): GroupExpansion {
	let expansion = expansions.get(table);
	if (!expansion) {
		expansion = new GroupExpansion();
		expansions.set(table, expansion);
	}
	return expansion;
}
