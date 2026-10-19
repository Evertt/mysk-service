/**
 * A test switch: makes a part of a page throw, on purpose, so the end-to-end tests see what a crash
 * does (`src/tests/e2e/errors.test.ts`), through `crash-switch.svelte`. Only in a dev server and
 * the e2e tests' build (`VITE_TEST_SWITCHES=1` at build time, `src/tests/e2e/global-setup.ts`):
 * Vite inlines `import.meta.env.DEV` and `VITE_TEST_SWITCHES` when it builds, so any other build
 * has `false` here, and drops the rest, in the browser's bundle and the server's alike. (Not
 * `$app/env`'s `dev`, which the server's bundle kept as a value, and the switch with it; nor
 * SvelteKit's static `$app/env/public`: in a dev build it's read from the dev server, which the
 * component tests have none of.)
 *
 * A test sets `sessionStorage["fieldworks:crash:<where>"]` to how many mounts should throw
 * (`crash()` in the e2e helpers); each one that does counts down. In the browser only: the server
 * renders as usual.
 */
import { browser } from "$app/env";

/** Whether this build has the switch. */
export const crashSwitches = import.meta.env.DEV || import.meta.env.VITE_TEST_SWITCHES === "1";

/** Throws if a test asked `where` (`page:dashboard`, `part:<slot contribution id>`) to crash. */
export function crashIfAsked(where: string) {
	if (!crashSwitches || !browser) return;
	const key = `fieldworks:crash:${where}`;
	const left = Number(sessionStorage.getItem(key) ?? 0);
	if (!(left > 0)) return;
	sessionStorage.setItem(key, String(left - 1));
	throw new Error(`Crashed on purpose (${where})`);
}
