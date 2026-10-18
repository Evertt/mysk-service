# Making the test suite faster

Measured on 2026-10-17 (`durations-2026-10-17.txt`, a loaded local run): the e2e project took
4,968 s summed over 104 files and 900 tests; every unit and component spec together, 176 s. A
server spec runs in about 0.05 s a test, an e2e test in about 5 s. On CI each of the 3 e2e shards
takes ~7.5 min, of which ~6 min is tests and ~1 min setup (vp, Playwright, build).

Every e2e test was classified (`core-1.md`, `core-2.md`, `modules.md`, one table per file):

| Part                       | Files | Tests | Now     | Can go              |
| -------------------------- | ----: | ----: | ------- | ------------------- |
| `src/tests/e2e`, first 25  |    25 |   267 | 1,313 s | ~665 s (51 %)       |
| `src/tests/e2e`, the other |    28 |   211 | 1,606 s | ~945 s (59 %)       |
| modules' e2e               |    52 |   423 | 2,450 s | ~1,260 s (51 %)     |
| **All**                    |   105 |   901 | 5,369 s | **~2,870 s (53 %)** |

About 250 tests stay e2e as they are, about 100 stay but get thinner, about 230 become server
specs, about 190 are duplicates of specs that exist, and the rest are component specs, merges or
low-value. The seconds are from a loaded run; unloaded, expect roughly half of each, at the same
proportions.

## Result (2026-10-18)

All five phases are done. The whole suite (`pnpm test`, locally, the same machine and load as the
measurement above):

|                        | 2026-10-17             | 2026-10-18                  |
| ---------------------- | ---------------------- | --------------------------- |
| e2e files / tests      | 104 / 900              | 95 / 506                    |
| e2e time, summed       | 4,968 s                | 2,824 s (−43 %)             |
| server specs (harness) | —                      | 47 files / 431 tests, 142 s |
| whole run, wall        | ~1,190 s (incl. rerun) | 875 s (incl. rerun, −26 %)  |

On CI the e2e runs in 6 shards instead of 3. What the e2e no longer checks is in server specs
(`docs/agents/tests.md`, "Server specs"); the agents named a few gaps left: read-only UI for
planners (hints, hidden buttons), the customer portal's checklist remotes, the energy live
simulation's backfill. Along the way: the seed now gives the date-dependent tests their cases on
any day, and three app bugs were fixed (the energy month chart, a schedule change lost before
the board's live stream opened, and a Svelte batching bug that froze pages: bug 12 in
`docs/upstream-bugs/`).

## The phases, cheapest first

1. **CI: more shards** (no test changes). The repository is public, so runners cost nothing: 3 → 6
   shards brings CI's e2e from ~7.5 to ~4–4.5 min. Also: move `skeletons.repro` out of the e2e
   glob (skipped, but collected every run), and run the splash "slow connection" test on demand.
2. **Delete the duplicates** (~190 tests, a few hours, no new code). Each is already covered by a
   named spec or core e2e: the malformed-query/range tests in `orders.list`, `orders.ranges`,
   `materials`, `materials.ranges`, `equipment.*` (`list-definition.spec`), materials' re-tests of
   the generic data table, `stock.spec`, `automatic.spec`, `setup.spec`, `ingest.spec` and
   `events.spec` duplicates, `customers.click-filter`, `energy.setup.tenancy`, and so on (see each
   report's top 10).
3. **Sign in once per lane** (~3 h): sessions for each demo user made in `global-setup.ts` (or a
   cached `storageState` per user and lane), so `useApp()` and `signedInPage()` start signed in;
   the UI sign-in stays in `auth.test`. Saves ~250–300 s summed. Also: choose each file's main
   actor in `useApp({ user })` (several sign in as North's admin and then work as SHLTR's people).
   **Done (2026-10-18):** a session row per browser context, written into the lane's database,
   with its cookie signed with a secret `global-setup.ts` gives the servers
   (`src/tests/e2e/sessions.ts`); global setup checks it against one real sign-in each run.
   Per context rather than cached per lane: switching organization changes the session row.
   `signedInPage()` still goes from /login to the home client-side, so its `requests` hold the
   home's remote queries. Measured: unloaded, a sign-in went from ~1.6 to ~1.3 s (admin) and
   ~0.9 to ~0.7 s (engineer): most of it is the home page, not the form. In a full run (104
   files, 392 s wall) the hooks (browser launch and sign-in) of the 94 files a develop run had
   summed 206 s against its 389 s, and the files 1,834 s against 2,615 s, but that run was more
   loaded (its tests alone were 27 % slower), so the sign-in's own share is roughly 80–180 s.
   Choosing each file's main actor is left to the files.
4. **A shared harness for server specs** (done, 2026-10-17): `src/tests/unit/lib/server/harness/`,
   described in "Server specs" in `docs/agents/tests.md`. The `server-harness` project seeds the
   demo database once per run (migrate 0.5 s + seed 2.2 s) and copies it per file (~10 ms); `as()`
   runs code in SvelteKit's own request store as a demo user (or the system), and `call()` /
   `submit()` run SvelteKit's real `query`/`form`/`command`, schema and gate included, answering
   as the client would (data, a status, form issues, a redirect, what was refreshed). Rather than
   stand-ins for `$app/server`, which would skip the schema: those are only in the generic
   module-gate spec (`src/tests/unit/module-gate.spec.ts`), which finds every module's remote
   functions and server routes by glob and checks that a tenant without the module gets a 404
   before their handlers run, and the core sets' role refusals. The two examples, ported from
   `orders.tenancy` (11 e2e tests, ~50–60 s) and `orders.list` (its server-side checks), are
   `src/tests/unit/lib/orders/server/tenancy.spec.ts` (11 tests) and `list.spec.ts` (11 tests),
   ~0.17 s each in tests, ~2–4 s per file with its imports. Not covered: better-auth's `auth.api`
   effects (members, invitations), what a client asks a command to refresh, a live query past its
   first value.
5. **Move the server logic into specs** (~230 tests): tenancy refusals of tampered ids, list
   filtering and sorting, rules and calculations, what gets logged. Write the missing specs first
   (invoices and credit notes, contracts, maintenance plans and orders, condition components and
   conditions, `scheduling.ts`, parts-shop orders, materials CRUD), then cut the e2e.

## The decision this needs

CLAUDE.md and `docs/agents/tests.md` say every section's (and module's) tests cover isolation in
e2e. Phase 5 changes that to: each section keeps one e2e page-404 and one tampered id through the
real form; the rest of its isolation is in its server spec, and module gating in the generic spec.
