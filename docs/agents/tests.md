# Tests

Read before you add a test file, a test helper, or a component test harness.

`pnpm test` runs everything: unit tests (`*.spec.ts` in Node; `*.svelte.spec.ts` in the browser)
and the end-to-end tests, which drive a production build of the app in Chromium (built with
`NODE_ENV=production`, as deployed), one server and fresh, seeded database per test worker (see the
Testing section of README.md). Svelte's dev-only checks, such as hydration mismatch warnings, are
only in `E2E_DEV=1` runs (one dev server, the files one at a time). `pnpm test` runs each file that
fails once more, afresh (`scripts/test.ts`; CI too): a file that fails twice is a real failure, and
one that only passes the second time is worth a look in the log. `vp test run` runs them once.

**Paraglide's messages**: every Vite instance compiles them when it starts, into a folder per
layout (`scripts/paraglide.ts`): the unit and component tests, the dev server and `pnpm generate`
write `src/lib/paraglide` (a module per language), the production builds, the e2e one included,
`.svelte-kit/paraglide` (a module per message, as deployed). Writers of one folder agree, so they
leave it alone: when a build swapped the tests' folder for ~2,900 modules and they swapped it back,
both broke ("Could not resolve './activity_action_accepted.js'", click timeouts). Keep it that way:
compile with the options in `scripts/paraglide.ts` and import the messages as `#lib/paraglide/…`.
The messages module is ~10 MB once transformed: Vitest 5.0.1 overflowed the stack reading it back
from its module cache (`fsModuleCache`) on the first run after a message changed ("Maximum call
stack size exceeded" at `messages.js` in ~60 `server-shared` files, passing on the retry).
`patches/vitest@5.0.1.patch` fixes that; check that an upgraded Vitest still needs it
(`docs/upstream-bugs/README.md`, 11).

**Where tests go**: all in `tests/` folders, never next to their subject, in the same shape for the
core and for each module.

- The core's: `src/tests/unit/` (specs, test harnesses, fakes and test support) mirrors `src/`:
  `src/lib/orders/display.ts` is tested by `src/tests/unit/lib/orders/display.spec.ts`, and a spec of
  the whole project sits at its root (`src/tests/unit/import-extensions.spec.ts`). `src/tests/e2e/`
  holds the end-to-end tests, their helpers (`app.ts`, `<section>-helpers.ts`) and the global setup.
- A module's: `src/modules/<id>/tests/unit/` mirrors the module's own folders
  (`server/billing.ts` is tested by `tests/unit/server/billing.spec.ts`), and
  `src/modules/<id>/tests/e2e/` holds its end-to-end tests. Nothing in a module's `tests/` is the
  module's code: the generator never reads it, and the boundary specs hold its files to the module's
  rules (its own files by any import, another module only through its `api/`).
- Tests import what they test through aliases, not relatively: `#lib/orders/display.ts`,
  `#modules/<id>/server/billing.ts`, `#routes/(app)/app-sidebar.svelte`, and the test helpers by
  `#unit/lib/modules/fakes.ts` (`src/tests/unit/`) and `#e2e/app.ts` (`src/tests/e2e/`). A helper
  next to the spec that uses it (a harness, `display.test-support.ts`) is imported relatively. A
  test is exempt from the barrel rule (above): it imports the domain's internals.
- Vitest runs the `*.spec.ts` of `src/tests/unit/`, of the modules' `tests/unit/` and of `scripts/`,
  and the `*.test.ts` of `src/tests/e2e/` and the modules' `tests/e2e/` (the `e2e` project). Nothing
  but tests imports from a `tests/` folder.

- A change to what a section's pages do gets an e2e test in that section's file
  (`src/tests/e2e/<section>.test.ts`, or `<section>.<aspect>.test.ts` where a long section is split
  by aspect, e.g. `orders.bulk.test.ts`, `orders.tenancy.test.ts`; shared helpers go in
  `<section>-helpers.ts`), written like the existing ones: tests are sequential steps sharing
  one signed-in page from `useApp()`, changes go through the UI, checks read the database with
  `rows()`/`value()`. Split a file by its independent `describe` blocks when it passes a few
  hundred lines: the longest file sets the e2e wall-clock time. A module's e2e tests are in its
  own folder (`src/modules/<id>/tests/e2e/<section>.test.ts` and `<section>.<aspect>.test.ts`, with
  the helpers they share in `helpers.ts`, importing `#e2e/app.ts`) and cover a tenant that
  has the module, one that hasn't (one of its pages is a 404 and the sidebar lacks it; that its
  remote functions and server routes refuse such a tenant is the generic module-gate spec's,
  `src/tests/unit/module-gate.spec.ts`, and that its slots stay empty `extension-slot.svelte.spec.ts`'s)
  and tenant isolation.
- What a section's server code decides (its rules and calculations, what its queries and lists
  return, how they filter and sort, what gets logged, what it refuses) is tested in a server spec
  (`*.spec.ts` in a `tests/unit/**/server/` folder), which runs it as a tenant on a seeded database
  in a fraction of an e2e test's time (see "Server specs" below). Its e2e test then only checks that
  the page shows and sends it; don't test the same rule through the UI again.
- Tenant isolation is covered for every section and module: South can't see or change North's
  records, also by tampering with ids. In e2e, one page that's a 404 for the other tenant and one
  form submitted with a tampered hidden id (`app.expectingErrors`); the rest (each remote function
  refusing another tenant's ids, lists and queries showing only the tenant's rows) in the
  section's server spec, which calls the remote functions as South with North's ids
  (`src/tests/unit/lib/orders/server/tenancy.spec.ts` is the example).
- Pure helpers (validation, formatting, domain rules, form schemas, table columns) get unit tests
  (`*.spec.ts`) in `tests/unit/`.
- Shared components get component tests (`*.svelte.spec.ts` in `tests/unit/`, rendered with
  `vitest-browser-svelte`). A component that needs a parent (a table, the theme provider) gets a
  `*.test-harness.svelte` beside its spec; form fields take fakes of remote form fields from
  `src/tests/unit/lib/components/form/fake-form.ts`; remote functions are replaced with `vi.mock`.
- Test files run in parallel, each worker against its own database; within a file, tests run in
  order. A file may change data (through the UI), but must not rely on another file's changes, nor
  break when another file ran before it on the same worker (so a test that needs the seeded state
  stays in a file before the tests that change it, or reads what it needs from the database).
- Only run one e2e run at a time: each run builds into `.svelte-kit/output`, and parallel runs (also
  from other checkouts) slow each other into timeouts. Wrap them in
  the shared lock (see "Before committing" in `AGENTS.md`).

## Server specs

The harness (`#unit/lib/server/harness/index.ts`) runs the app's server code as a request runs it,
on the demo data, and calls remote functions without HTTP. A spec that imports it runs in the
`server-harness` project (`vite.config.ts` finds it by that import):

- **The database**: the project's global setup migrates and seeds one once per run, as the e2e
  global setup does (about 3 s), and each file gets a copy of its own (milliseconds) as the app's
  `db`. A file may change it; no other file sees that. Check with `rows(sql, args)` and
  `value(sql, args)`, as in e2e, and `organizationId("north")` for the ids. A spec that makes a small
  database of its own (`vi.mock("#lib/server/db/index.ts")`) still can, in `server-isolated`.
- **Who**: `as(actor, work)` runs `work` in a request of `actor`: `north`, `south` or `shltr`'s
  `owner`, `admin`, `member` (a planner), `engineer` or `customer` (a customer's contact), or
  `demoAccount(email)` for another demo user. They're `demo.ts`'s people; for a role the seed has no
  one in (an admin; South's member, engineer and contact) the harness adds an account to the file's
  database on first use, linked as the seed links its own. `locals` are what `hooks.server.ts`
  makes of a session (the tenant from `loadTenant()`, so the modules and order types are the
  database's), so `currentTenant()`, `await currentEngineer()`, `inTenant()` and the rest answer as
  in the app; in English and Amsterdam's time zone, unless the third argument says
  (`{ locale: "nl" }`). `signedOut(work)` for no one, `asSystem("north", work)` for the daily jobs'
  system, `withoutModule("north", "invoices", work)` for a tenant without a module.
- **Remote functions**: `call(getOrder, number)` (a query, batch query, live query or command) and
  `submit(updateOrder, fields)` (a form, its fields as the browser sends them: ids as strings) run
  SvelteKit's own: the schema, the set's gate, then the handler, each call a request of its own.
  They answer what the client gets: `{ status: 200, data }`; a form refused, by its schema or
  `invalid()`, as `{ status: 400, issues: [{ name, path, message }] }`; an `error()` as
  `{ status, message }` (also the 400 for an argument the schema refuses); a `redirect()` as
  `{ status, location }`. A command's or form's answer lists the queries it refreshed
  (`refreshed: ["getOrder"]`); a live query's is its first value. `data(getOrders, query)` is the
  data of a call that must succeed.

```ts
test("North's orders are a 404 for South, also by their ids", async () => {
	expect(await as(south.owner, () => call(getOrder, northOnly))).toMatchObject({ status: 404 });
	const id = String(
		await value(`select id from "order" where number = ? and organization_id = ?`, [
			northOnly,
			organizationId("north"),
		]),
	);
	expect(await as(south.owner, () => submit(deleteOrder, { id }))).toMatchObject({ status: 404 });
});
```

`src/tests/unit/lib/orders/server/tenancy.spec.ts` and `list.spec.ts` are the examples: about
15 ms a test. What it can't do: better-auth's `auth.api.*` (signing in, invitations, members'
roles, switching organizations), which needs a real session: spec the refusals before such a call,
and leave its effects to e2e. Nor what the client asked a command to refresh (`requested()` finds
nothing), a live query's later values, rendering a page, or `handleGuard`'s redirects. The module-gate
spec calls gated handlers past SvelteKit's validation, with the stand-ins of `stand-ins.ts`.
