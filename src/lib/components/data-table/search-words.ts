/**
 * A search box's words, the same for every table: those whose rows the server searches
 * (`searchMatch()` in `#lib/server/lists/plan.ts`) and those whose rows are all in the browser (the
 * `allWords` filter, `search-filter.ts`). A row matches when each word is in one of its searched
 * columns, the words in any of them, in any case.
 */
import { listLimits } from "./list-definition.ts";

/**
 * The words of a search: split on white space, without empty ones, at most `listLimits.words`
 * (the rest are ignored), e.g. `" Bakker  Tiel "` → `["Bakker", "Tiel"]`.
 */
export const searchWords = (text: string): string[] =>
	text.split(/\s+/).filter(Boolean).slice(0, listLimits.words);
