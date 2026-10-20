import { Debounced, resource } from "runed";

/**
 * A search box over options that come from the server (a combobox, a filter's popover): it searches
 * while `open`, right away when opened (or when `also` changes), and for `text` once typing pauses.
 * A newer search's answer wins over an older one's; a failed search, or a closed box, keeps what was
 * found before. Bind the box to `text` and its popover to `open`.
 */
export class SearchWhileOpen<T> {
	open = $state(false);
	/** What's in the search box. */
	text = $state("");
	readonly #term: Debounced<string>;
	readonly #answer: { readonly current: T | undefined; readonly loading: boolean };

	constructor(
		find: (term: string) => PromiseLike<T>,
		{ delay = 250, also }: { delay?: number; also?: () => unknown } = {},
	) {
		this.#term = new Debounced(() => this.text.trim(), delay);
		this.#answer = resource(
			[() => this.open, () => this.#term.current, () => also?.()],
			async ([open, term], _, { data, signal }) => {
				if (!open) return data;
				const found = await find(term);
				signal.throwIfAborted();
				return found;
			},
		);
	}

	/** What the latest search found, if any yet. */
	get found() {
		return this.#answer.current;
	}

	/** Whether a search is waiting for typing to pause or for its answer. */
	get searching() {
		return this.#term.pending || this.#answer.loading;
	}

	/** Empties the search box, so the next search is for everything. */
	clear() {
		this.text = "";
		this.#term.setImmediately("");
	}
}
