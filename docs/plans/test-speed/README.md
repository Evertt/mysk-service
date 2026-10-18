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
   **In progress (branch `e2e-signed-in`):** a session row per browser context written into the
   lane's database, with its cookie signed with a secret `global-setup.ts` gives the servers
   (`src/tests/e2e/sessions.ts`); global setup checks it against one real sign-in each run. Per
   context rather than cached per lane, since switching organization changes the session row.
   `signedInPage()` still goes from /login to the home client-side, so its `requests` hold the
   home's queries. Measured: ~0.3–0.9 s saved per sign-in unloaded (most of a sign-in is the home
   page, not the form); hooks per file ~1–2 s less under load. A near-full run summed 2,134 s over
   103 files against 2,615 s for the dedupe agent's 94-file baseline (different load; not a clean
   comparison).
4. **A shared harness for server specs** (~3–4 h): call a remote function, gate included, as a
   tenant on a seeded copy of the demo database, with the `$app/server` stand-ins of
   `remote-functions.spec.ts` and a faked request event; plus one generic module-gate spec (every
   module's remote functions refuse a tenant without the module).
5. **Move the server logic into specs** (~230 tests): tenancy refusals of tampered ids, list
   filtering and sorting, rules and calculations, what gets logged. Write the missing specs first
   (invoices and credit notes, contracts, maintenance plans and orders, condition components and
   conditions, `scheduling.ts`, parts-shop orders, materials CRUD), then cut the e2e.

## The decision this needs

CLAUDE.md and `docs/agents/tests.md` say every section's (and module's) tests cover isolation in
e2e. Phase 5 changes that to: each section keeps one e2e page-404 and one tampered id through the
real form; the rest of its isolation is in its server spec, and module gating in the generic spec.
