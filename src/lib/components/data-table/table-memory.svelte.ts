/**
 * What the app remembers of a member's data table, in the database (`table_memory`, see
 * `table-memory.remote.ts`), so it follows them to other devices:
 *
 * - **Their columns**: which hideable columns they show (see `column-visibility.ts`), for good.
 * - **Where they left it**: its parameters (not where it was scrolled to) and the saved view they had open.
 *   Opening the table's page without parameters brings that back: the view, with any changes
 *   they didn't save in it still shown as such (see `saved-views.svelte`), so leaving the page
 *   never loses them. A link with parameters wins (the columns and the view still come back, the
 *   view if the link shows what it was left at). Choosing no view forgets it, as does any way back
 *   to the table's defaults.
 *
 * A table takes part when its page's universal load (`+page.ts`) is `loadTableMemory`: that
 * redirects a visit without parameters to the parameters left, before anything renders (no flash
 * of the default table, and the page's queries ask for the right rows from the start), and hands
 * the memory to the table (as `page.data.tableMemory`), which shows its columns from the first
 * render. The table (`syncTableWithUrl`) then remembers its changes as they happen (see
 * `rememberTable`). Only the URL's parameters, the open view and the columns are remembered:
 * not where it was scrolled to (`?row=`), which a list's data soon moves under.
 *
 * Stored on the server rather than in the browser so it follows the member, and so the server can
 * redirect before rendering the page, which it couldn't from browser storage.
 */
import { browser } from "$app/env";
import { page } from "$app/state";
import { redirect } from "@sveltejs/kit";
import { useDebounce } from "runed";
import { untrack } from "svelte";

import { changedVisibility, currentVisibility, defaultVisibility } from "./column-visibility.ts";
import {
	getTableMemory,
	rememberTable as remember,
	type TableMemory,
} from "./table-memory.remote.ts";
import type { TableUrlSync } from "./url-sync.svelte.ts";
import { tableViewsKey } from "./views.ts";

/** How long the memory waits for the table to settle before it's saved. */
const saveDelay = 500;

/**
 * Memory saved in this tab and not yet on the server, by owner and table (`unsavedKey`): newer
 * than what the server answers. Only ever filled in the browser (by `rememberTable`'s effects), so
 * never shared between the server's requests.
 */
const unsaved = new Map<string, TableMemory>();

/** Where `unsaved` keeps a table's memory: per owner, so another organization never reads it. */
const unsavedKey = (owner: string, key: string) => `${owner}|${key}`;

/** What a load needs of its event (SvelteKit's `LoadEvent`). */
interface MemoryLoadEvent {
	url: URL;
	route: { id: string | null };
	untrack<T>(fn: () => T): T;
}

/**
 * The universal load (`export const load = loadTableMemory` in a table page's `+page.ts`) that
 * brings a table back as the member left it: a visit without parameters is redirected to the
 * parameters left (before the page renders), and the memory is passed to the table. For a page
 * whose one table keeps its state in the URL without a prefix. It reads the URL untracked, so the
 * table's own changes to it don't run it again.
 */
export async function loadTableMemory(event: MemoryLoadEvent) {
	const key = tableViewsKey(event.route.id ?? event.untrack(() => event.url.pathname));
	const answer = await fetchMemory(key);
	const memory = unsaved.get(unsavedKey(answer.owner, key)) ?? answer.memory;
	const url = event.untrack(() => event.url);
	if (memory?.query && url.search === "") redirect(307, `${url.pathname}${memory.query}`);
	return { tableOwner: answer.owner, tableMemory: { [key]: memory } };
}

/**
 * The memory of a table, as the server has it now. In the browser, asked for again: the query's
 * answer may be one the server rendered a page with earlier in the visit (SvelteKit keeps those
 * until a query takes them), from before the table changed.
 */
async function fetchMemory(key: string) {
	if (!browser) return getTableMemory(key);
	const query = getTableMemory(key);
	await query.refresh();
	return query.current!;
}

/** The memory the page's load passed for a table: `undefined` if it doesn't take part. */
export const passedMemory = (key: string): TableMemory | null | undefined =>
	page.data.tableMemory?.[key];

/**
 * Whose tables the page shows (the organization and the member), if its load brings them back:
 * what the browser keeps of a table is kept per owner (see `column-widths.svelte.ts`).
 */
export const passedOwner = (): string | undefined => page.data.tableOwner;

/** What the memory needs of the table (TanStack Table's). */
type MemoryTable = Parameters<typeof defaultVisibility>[0];

/**
 * Remembers a table's changes (its parameters, open view and columns) as they happen, saved once
 * it settles and when it goes. `memory` is what the table started from. Call it while a component
 * initializes.
 */
export function rememberTable(
	table: MemoryTable,
	sync: Pick<TableUrlSync, "viewsKey" | "viewQuery" | "viewId">,
	memory: TableMemory | null,
	owner: string,
) {
	const key = sync.viewsKey;
	const pending = unsavedKey(owner, key);
	const defaults = defaultVisibility(table);
	const now = $derived<TableMemory>({
		columns: changedVisibility(defaults, currentVisibility(table)),
		query: sync.viewQuery(),
		viewId: sync.viewId ?? null,
	});
	let saved = JSON.stringify(memory ?? { columns: null, query: "", viewId: null });

	const save = useDebounce(() => {
		const next = unsaved.get(pending);
		if (!next) return;
		remember({ owner, tableKey: key, ...next })
			.catch(() => {
				// Not remembered: the table works all the same.
			})
			.finally(() => {
				if (unsaved.get(pending) === next) unsaved.delete(pending);
			});
	}, saveDelay);

	$effect(() => {
		const next = $state.snapshot(now);
		const json = JSON.stringify(next);
		if (json === saved) return;
		saved = json;
		unsaved.set(pending, next);
		void untrack(save);
	});
	// Leaving the page: now.
	$effect(() => () => void save.runScheduledNow());
}
