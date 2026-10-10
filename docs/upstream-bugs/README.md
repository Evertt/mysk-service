# Bugs to report upstream

Bugs in dependencies found while working on this app (October 2026), worked around locally and not
reported yet. Each should be reported in Evert's name, after he has read the draft. For each: check
that it still happens on the latest release and that nobody reported it meanwhile, cut the
reproduction down to the smallest that still fails, and draft the issue (title, versions, steps,
expected vs actual, the workaround we use).

The folders hold the reproduction material as it was left; it was written to run from a scratch
folder, so adjust paths before running it. Nothing here is part of the app (not linted, tested or
built).

Already reported: the `$effect.pending()` leak, https://github.com/sveltejs/svelte/issues/18970.

## 1. Svelte: hydration skips past a failed boundary inside an async block

- **Versions:** svelte 5.57.1 and 5.57.2, with `experimental.async`.
- **What happens:** a `<svelte:boundary>` with a `failed` snippet that fails during SSR (with a
  `transformError`, as SvelteKit 3 always passes) is written behind a `<!--[?{json}-->` marker.
  When that boundary sits inside an async block (one that depends on an awaited value),
  hydration throws a `hydration_mismatch` and the page falls back to its error page.
- **Cause:** `skip_nodes()` in `src/internal/client/dom/hydration.js` counts `[`, `[!` and `[<n>`
  as openings but not `[?`, so it loses track of the depth and skips past the block's end.
- **Fix (our patch):** `patches/svelte@5.57.1.patch` adds `data.startsWith(HYDRATION_START_FAILED)`
  to that check. Registered in `pnpm-workspace.yaml`.
- **Reproduction:** `svelte-hydration-failed-boundary/`: `run.mjs` compiles the components,
  server-renders `App.svelte` (a list of boundaries in an async block, one of which throws) with
  a `transformError`, then hydrates it in Chromium with Playwright and prints the console.
  `APP=AppAsyncIf.svelte` etc. pick the variants; `AppSync*.svelte` (no async block) hydrate fine,
  which narrows it to the async case.
- **In the app:** a module's part of a core page that fails during SSR
  (`src/routes/(app)/module-slots.svelte`).

## 2. Svelte: the tab freezes when a component in an `{#each}` awaits its own loader

- **Versions:** svelte 5.57.1 and 5.57.2, with `experimental.async`.
- **What happens:** `module-slots.svelte` first rendered one child component per module, each
  awaiting its own `load()` (`const Part = $derived((await load()).default)`) inside its own
  boundary. After deleting an order from its page (which navigates away while the slot's queries
  refresh), the browser tab froze in an endless loop; five tests in `e2e/orders.test.ts` and two
  in `contracts.orders.test.ts` timed out. Bisected to that child's `await`; loading every
  component up front in the parent (`$derived(await Promise.all(...))`, the current code) doesn't
  freeze.
- **Not minimized yet.** `svelte-each-await-freeze/module-slots.svelte` is the parent of the
  version that froze; the child (`module-slot.svelte`) wasn't kept, but its shape is above. Next
  step: rebuild the child, reproduce with the e2e tests named above, then cut it down to a
  playground (an `{#each}` of children that each `await` a promise, with the list or a query
  changing while a navigation tears the page down).

## 3. svelte-sonner: the toast timer effect loops while the toaster is hovered

- **Version:** svelte-sonner 1.2.1 (latest when found; still on its main branch then).
- **What happens:** `Toast.svelte` keeps `closeTimerStartTime` and `lastCloseTimerStartTime` in
  `$state`. The timer `$effect`'s pause branch (toaster `expanded`, i.e. hovered, or
  interacting, or the page hidden) calls `pauseTimer()`, which reads `lastCloseTimerStartTime`
  and then sets it to `new Date().getTime()`, so the effect invalidates itself and runs again
  until two runs land in the same millisecond. On a slow or busy machine they don't, and Svelte
  throws `effect_update_depth_exceeded` (in dev builds ~1000 "updated at" traces), breaking the
  page.
- **Fix (our patch):** `patches/svelte-sonner@1.2.1.patch` makes both plain `let`s (nothing
  renders them).
- **Reproduction:** `svelte-sonner-timer-loop/repro.mjs`: a Playwright script that, against a
  preview build of this app (`NODE_ENV=test vp build --sourcemap`, a freshly seeded database),
  edits and saves a contract over and over with 4× CPU throttling, leaving the pointer on the
  save button so the toast appears under it. Before the patch it failed within 14–19 rounds;
  after it, 80 rounds at 4–6× passed. For the issue, a minimal page with one `toast()` and the
  pointer resting on the toaster, under CPU throttling, should do.
