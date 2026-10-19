/**
 * The `sessionStorage` key that sets how long the pointer rests on a record link before its hover
 * card opens, in milliseconds (`openDelay()` in `previews.ts`): the end-to-end tests set it to 0 in
 * every tab (`newContext()`, `src/tests/e2e/app.ts`), so no test waits half a second for a card.
 * Plain, so the tests import it without Svelte.
 */
export const previewDelayKey = "fieldworks:record-preview-delay";
