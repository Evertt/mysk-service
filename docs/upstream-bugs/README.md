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
  (`src/lib/extensions/extension-slot.svelte`).

## 2. Svelte: the tab freezes when a component in an `{#each}` awaits its own loader

- **Versions:** svelte 5.57.1 and 5.57.2, with `experimental.async`.
- **What happens:** `extension-slot.svelte` (then `module-slots.svelte`) first rendered one child component per module, each
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

## 4. Svelte: "Batch has scheduled effects" invariant violation with `{#each await …}`

- **Versions:** svelte 5.57.1, with `experimental.async`.
- **What happens:** a `<svelte:boundary pending={…}>` whose children are
  `{#each await loadParts() as part}` raised
  `invariant_violation … "Batch has scheduled effects"` once per browser component test, also in
  the tests that didn't defer. Svelte's own message calls it a bug in Svelte.
- **Found while** making the dashboard's module cards client-only (first attempt).
- **Evidence:** `svelte-batch-scheduled-effects/spec1.log` (vitest-browser-svelte run of
  `src/routes/(app)/module-slots.svelte.spec.ts`), and the component that triggered it,
  `svelte-batch-scheduled-effects/module-slots.svelte`. The component from before that change, on
  the same spec, gave no errors.
- **Not minimized.** Next step: an `{#each await promise}` inside a boundary with a `pending`
  snippet, in a component test.
- **Second trigger (2026-10-13):** loading a module's skeleton with `import()` right after the
  office layout mounts, then navigating within a split second of signing in. Reproduced by
  `src/tests/e2e/skeletons.repro.test.ts` (`REPRO_SKELETONS=1 REPRO_CPU_RATE=1`) in a dev build only:
  a few rounds in 50 alone, 27 in 50 beside three other e2e files. The check is `DEV`-only
  (`batch.js` `#commit`, "Batch has scheduled effects"); its throw aborts the commit with the other
  batch still active, followed by `effect_update_depth_exceeded` and a frozen page. Production
  builds were clean (0 in 50, twice). Worked around in `patches/svelte@5.57.1.patch` (a warning
  instead of the throw). The question for upstream: why a started batch still has scheduled
  effects (and no decrement queued) when another batch commits, i.e. whether the check is wrong
  or the scheduling is.

## 5. Svelte (with layerchart): the tab freezes when a `pending` boundary hydrates slow work

- **Versions:** svelte 5.57.1, layerchart 2.5.2, with `experimental.async`.
- **What happens:** on the dashboard (which renders layerchart charts), any work inside a
  hydrating `<svelte:boundary>` with a `pending` snippet that takes longer than one task (a loader
  delayed by just `setTimeout(…, 50)`) froze the browser tab after hydration. Work that settles
  within the task (`Promise.resolve`) didn't. Paused through the Chrome debugger, the stack was in
  the charts re-rendering (`get yDomain`, `get yScale`, `get height`, `bind:clientWidth`,
  `isMeasured`) inside Svelte's batch flush. A `pending` boundary on record pages (no charts,
  `ActivityCard`) works. Likely the same family as the `$effect.pending()` freeze on the dashboard
  (see #18970 and the memory on it).
- **Evidence:** `svelte-pending-boundary-chart-freeze/`: the component (`module-slots.svelte`),
  the e2e run where 20 dashboard tests timed out (`e2e1.log`), the bisection (`debug3`–`debug9`:
  literal `pending` snippet froze; trivial `await Promise.resolve` didn't; parts with no
  components froze; loaders as `Promise.resolve` didn't; loaders delayed 50 ms froze; parts as an
  awaited prop froze), and the paused stack (`debug11.log`).
- **Workaround in the app:** the dashboard's module cards render after `onMount` (a `deferred`
  option on the slot component), with no `pending` boundary.
- **Not minimized.** Next step: a page with one layerchart chart and a boundary with a `pending`
  snippet around `await new Promise((r) => setTimeout(r, 50))`, server-rendered and hydrated.

## 6. SvelteKit: a failed remote query stays cached under a `pending` boundary

- **Versions:** @sveltejs/kit 3.0.0, svelte 5.57.1.
- **What happens:** with the module cards rendered after mount inside a boundary with a `pending`
  snippet, a card whose query (`getContractsOverview`) had failed showed the failure notice; its
  "Try again" (which re-renders the part in a fresh boundary) sent no new request and got the
  cached failure back. The same steps without the `pending` boundary, and with the earlier
  component, fetched again and got a 200.
- **Suspected cause (not confirmed):** the client query cache
  (`kit/src/runtime/client/remote-functions/cache.svelte.js`) drops an entry only when no query
  object or pin refers to it any more; something under the `pending` boundary seems to keep a
  reference to the failed query.
- **Evidence:** `kit-query-cache-after-pending/`: the component and dashboard page of that attempt,
  the failing run (`debug15.log`) and the two controls (`debug16.log`, `debug17.log`).
- **Not minimized,** and it may be a Svelte rather than a SvelteKit issue; find what holds the
  reference first.

## 7. SvelteKit: `refreshAll` makes the page being left ask for all its queries again

- **Versions:** @sveltejs/kit 3.0.0, svelte 5.57.1.
- **What happens:** a remote form that redirects (and refreshes nothing itself) navigates with
  `_goto(redirect, { refreshAll: true })`. Its `accept` callback calls `reset()` on every cached
  query, with the comment "don't refresh yet, as some queries will be unrendered, but clear caches
  so that newly rendered queries don't use stale data". But `reset()` only drops the query's
  promise, and the page being left still renders them: they're read again at once and fetch
  again, before the navigation (and Svelte warns `derived_inert`). After a delete, that's the
  deleted record's own queries, which answer 404. Any part of the old page that shows its errors
  shows the failure; ours, a module's slot, logged it when the 404 came in before the page was
  gone (under load). Worse, the old page re-runs its queries with the new route's params: after
  deleting a unit, `/equipment/[serial]`'s `getEquipment(params.serial)` was asked with no
  argument, answered 400, and the list it navigated to showed the error page ("Bad Request (400)")
  instead, two deletes out of three in a row (`trace-400.log`). Besides, every query of the layout
  is fetched twice: once there, once by the `start()` after the navigation.
- **Expected:** the queries of the page being left aren't fetched again; those still rendered
  after the navigation are refreshed once, as the code's comment intends.
- **Workaround in the app:** the delete dialog (`src/lib/components/form/delete-dialog.svelte`)
  submits with `submit().updates()` and nothing in it, so there's no `refreshAll`; its forms
  refresh what they change on the server or redirect to a list that loads afresh.
  The e2e tests of deleting a unit (`src/tests/e2e/equipment.test.ts`) and an order
  (`src/modules/materials/tests/e2e/materials.orders.test.ts`) check that no query asks about it
  after the delete.
- **Evidence:** `kit-refreshall-refetches-leaving-page/`: `trace.log` (the requests around a delete,
  before and after the workaround) and `repro.test.ts`, the e2e test that logged them.
- **Not minimized.** Next step: a page rendering `await getThing(id)`, and a form on it that
  deletes the thing and `redirect()`s to another page with a slow query; the network panel shows
  `getThing` asked again, before the navigation.

## 8. Svelte/SvelteKit: a component created while a preload fork exists never runs its effects

- **Versions:** svelte 5.57.1, @sveltejs/kit 3.0.0 with `experimental.forkPreloads`, Svelte's
  `experimental.async`.
- **What happens:** on the schedule board, dragging a card over the others hovers their links to
  the orders' pages, and SvelteKit preloads each in a `fork()` (`_preload_data` in
  `runtime/client/client.js`). The drop moves the card to another cell (a query's
  `withOverride()`), which creates a new card component there. Every few moves that new card
  never ran any of its effects: neither its template's updates (its `pending` class stayed, so it
  kept pulsing) nor a `$effect` in it (not even on mount), while its DOM was inserted. The next move
  on the board brought it back.
- **Evidence:** a trace on the deployed app (real mouse drags; Playwright's `dragTo` doesn't hover
  the links on its way, and never triggered it): the stuck card's `$effect` logged nothing, the
  set its `pending` comes from no longer held its id, and the element was connected. With the
  cards' links not preloaded (`data-sveltekit-preload-data="off"`) it didn't happen again; with
  them preloaded, a few moves did it.
- **Suspected cause:** effects of a branch created while a fork is pending are taken as the
  fork's, and dropped when the fork is discarded (the hover moved on), though the branch's DOM was
  committed with the real update.
- **Workaround:** the cards' order links aren't preloaded
  (`src/modules/schedule/board/order-card.svelte`).
- **Reproduction:** not cut down yet. Likely: a list of items with links preloaded on hover, a
  state change that moves an item to another list (re-creating it) while a hover preload is
  pending, and a `$effect` in the item that should log.

## 9. SvelteKit: `invalidateAll()` leaves a live query's failed reconnect unhandled

- **Versions:** @sveltejs/kit 3.0.0 (remote functions, `query.live`).
- **What happens:** after a navigation with `invalidateAll` (and when a command's response asks
  for it), SvelteKit reconnects every live query with `void resource.reconnect()`
  (`_goto` in `runtime/client/client.js`, `remote_request` in
  `runtime/client/remote-functions/shared.svelte.js`). `reconnect()` awaits a promise that rejects
  with "Live query connection was interrupted" when the connection never comes up, e.g. because
  the page is being left (signing out from the dashboard, whose activity is live). `void` doesn't
  handle the rejection, so it surfaces as an unhandled rejection (a `pageerror` in the e2e tests,
  which failed `auth.test.ts` now and then).
- **Workaround:** `patches/@sveltejs__kit@3.0.0.patch` catches it at both calls.
- **Reproduction:** a page with a `query.live`, and a form or link that signs out and navigates
  with `invalidateAll`: now and then the console shows the unhandled rejection.

## 10. Svelte: a derived read while another batch is pending is computed anew on every read

- **Versions:** svelte 5.57.1 and 5.57.2 (same code), with `experimental.async`.
- **What happens:** on the dashboard, resizing the window from below 768 px to 768 px or wider
  (where the sidebar comes in) blocked the main thread for 7 s in a production build, 2–3 s per
  layerchart chart. A resize that doesn't cross the breakpoint took ~70 ms.
- **Cause:** while another batch is pending, `Batch.apply()` sets `batch_values` ("time
  travelling"), and then `update_derived` (`reactivity/deriveds.js`) stores the derived's value in
  `batch_values` but leaves the derived dirty, and `is_dirty` (`runtime.js`) doesn't look there:
  every `get()` of it computes it again, and `is_dirty` computes every derived it depends on again,
  so a derived graph is walked as a tree, without reuse. layerchart's chart state is a deep graph
  of deriveds read through spread and rest props: 17 million derived computations in one flush,
  against 5,000 for the same redraw without a pending batch. The pending batch: crossing the
  breakpoint makes the sidebar's content anew (`sidebar.svelte` renders a sheet below it), whose
  user menu awaits `getCurrentUser()`, a query nothing else had loaded, while the charts'
  `bind:clientWidth` sets their width in a batch of its own. A preload fork (the pointer on a
  link) did the same, twice over (two frozen flushes).
- **Fix (our patch):** `patches/svelte@5.57.1.patch` keeps a set of "fresh" deriveds per
  `batch_values` (`fresh_deriveds` in `reactivity/batch.js`): `update_derived` adds a connected
  derived it computed there, `mark_reactions` and `remove_reaction` (disconnecting) take it out,
  and `is_dirty` takes a fresh one as clean. Not in a fork, which has `fork_deriveds`. After it:
  13,000 computations, the longest task ~120 ms.
- **Reproduction:** `svelte-time-travel-derived-recompute/`: `repro.mjs` times the resize against a
  preview build and, on a build instrumented by `instrument.py`, counts the derived computations
  and records the pending batches (where they were made). For the issue: a component with a chain
  of a dozen deriveds that each read the previous one twice, an `await` of a slow promise mounted
  in a new `{#if}` branch, and a state change elsewhere in the same frame: the chain's
  computations should grow as 2ⁿ (not tried yet).
- **Maybe also** #5 (the freeze under a hydrating `pending` boundary) and the `$effect.pending()`
  freeze on the dashboard: both had layerchart's deriveds in the stack while another batch was
  pending. Worth checking with the patch before reporting those.
- **Test:** `src/tests/e2e/dashboard.test.ts`, "redraw at once when the window grows wide enough
  for the sidebar".
