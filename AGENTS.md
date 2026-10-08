## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: vitest, tailwindcss, sveltekit-adapter, drizzle, better-auth, paraglide, ai-tools, experimental
- **Before committing**: `pnpm run check` (code generation, format, lint and svelte-check; plain
  `vp check` skips the type check), then `pnpm test`.
- **Parallel agents** that edit code each get their own worktree (`isolation: "worktree"`), rename
  its branch after the task, copy in `.env` (`git worktreeinclude apply`) and run `pnpm install`
  first: in a shared checkout they type-check each other's half-written files and reload each
  other's dev servers.

## Where files go

Put a module next to the code that uses it, in the nearest folder that contains all of its users.

- **Used by one route** (components, `*.remote.ts`, helpers, their tests): in that route's folder, e.g. `src/routes/(app)/orders/orders-table.svelte`. Only `+`-prefixed files are routes, so these are ignored by the router.
- **Used by several routes under one folder**: in that folder, e.g. `src/routes/(app)/orders/order.remote.ts` serves `/orders/new`, `/orders/[number]` and its edit page, and `src/routes/(app)/app-sidebar.svelte` serves every route behind the login. Import it relatively (`../order.remote.js`).
- **Used across unrelated parts of the app**, or generic and route-independent (shared UI such as `#lib/components/data-table`, themes, formatting, domain enums): in `src/lib`, imported via `#lib/...`.
- **Server-only code** (database, secrets, auth): always in `src/lib/server/`, whoever uses it, so SvelteKit keeps it out of client bundles. One exception: plain helpers that a route's remote files share (a `.remote.ts` may only export remote functions) go in a `*.server.ts` next to them, e.g. `orders/order-list.server.ts`, which SvelteKit keeps out of client bundles too.

When a module gains a user outside its folder, move it up to the nearest common folder (or `src/lib`); when it loses users, move it down.

## Tenants and modules

The app is multi-tenant: organizations (better-auth's organization plugin) own all business data, and
optional modules (`src/lib/modules.ts`) are enabled per organization (`organization_module`). The
helpers are in `src/lib/server/session.ts`:

- Every remote function starts with `requireMember()` (or `requireUser()` if it doesn't touch
  tenant data, or `requireModule("<id>")` in an optional module, which 404s when the organization
  doesn't have it, or `requireManager()` (an owner or admin) for organization settings).
- Every select, update and delete on a tenant table (one with `organizationId`) includes
  `inTenant(table)` in its `where`, including lookups by id or code: ids are global and come from
  the client. Check that submitted references (e.g. a `customerId`) belong to the tenant, for a
  clear message (the foreign keys would refuse them anyway). Write the tenant scope with
  `idInTenant(table, id)` and `idsInTenant(table, ids)` (`session.ts`) instead of spelling out
  `and(eq(table.id, id), inTenant(table))`, and a join to a tenant table with
  `.leftJoin(...tenantJoin(engineer, order.engineerId))`: a bare `eq(table.id, id)` then stands out
  in review. `contract_equipment` has no `organization_id`: reach it through a tenant-checked
  contract or equipment.
- Inserts set `organizationId` from `requireMember()`. Codes and numbers are unique and sequential
  per organization: pick the next one with `nextNumber(tx, "order")` (`src/lib/server/numbering.ts`;
  the formats are in `src/lib/numbering.ts`) and insert it in the same `db.transaction`
  (transactions take turns, see `src/lib/server/db/serialize.ts`, so concurrent creates can't pick
  the same one).
- References between tenant tables are composite foreign keys that include the tenant, e.g.
  `(organization_id, customer_id)` → `customer (organization_id, id)`, and relations use the same
  column pairs, so the database refuses cross-tenant references and `with:` loads stay in the
  tenant. A new reference gets the same treatment; joins also add `inTenant()` for the joined
  table. Where a reference must belong to the same customer (an order's equipment, a contract's
  coverage), the key pairs `customer_id` instead.
- An optional module's tables reference core tables, never the reverse; core sections don't know
  about modules. A module adds to core pages through `slots` in `src/lib/modules.ts` (components
  that load their own data with `requireModule()`), and to core server logic through hooks in
  `src/lib/server/modules.ts`; both only take part for tenants that have the module. Anything that
  shows or adds up order totals prices them with `priceOrders()` (`src/lib/server/pricing.ts`),
  which applies the modules' adjustments.
- Shared server helpers, so each section doesn't write them again: `bulkChange()` and
  `refreshRequested()` for bulk commands (`bulk.ts`), `deleteAndLog()` for deleting a record
  (`records.ts`), `refuse()` for refusing a form with its problems (`forms.ts`), and in pricing
  `lineTotalSql()` and `materialsPerOrder()` for the SQL twins of an order line's total.

## Database schema

The schema is `src/lib/server/db/schema.ts`; the database gets it through the migrations in
`drizzle/`, never `drizzle-kit push`. After changing the schema, run
`pnpm db:generate --name <what-changed>` (e.g. `add-invoice-reference`), check the SQL it wrote,
and commit it with the change; `pnpm db:migrate` applies it to `local.db` (`pnpm db:reset` starts
over from the migrations and the seed). `src/lib/server/db/migrations.spec.ts` fails while the
schema has changes no migration makes. Never edit a migration that's been committed: add another.

## Activity log

Every mutation logs itself with `recordActivity(tx, …)` (`src/lib/server/activity.ts`), inside the
`db.transaction` that makes the change and after making it, so a refused or rolled-back change logs
nothing (wrap a single write in a transaction for this). Tenant and user come from the request
(`requireTenant()`, so the engineer portal logs too):

```ts
await db.transaction(async (tx) => {
	await tx.update(customer).set(input).where(idInTenant(customer, id));
	const subject = { type: "customer", id, label: existing.code };
	await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
});
```

- `action` is one of `activityActions` (`src/lib/models.ts`): created, updated, deleted, or a verb
  that says more (scheduled, stock_received, …); a new one also gets a sentence in `actionVerbs`
  (`messages/<locale>/activity.json`).
- `subject` is the record: its type, id, and the label it's known (and its page found) by now,
  e.g. the order number. `parent` puts it on another record's card too (an order line's order).
- For an update, pass the row as loaded as `before` and what the update sets as `after`: only
  `after`'s fields are compared, and an update that changes nothing logs nothing. `ignore` leaves
  out fields that follow from others.
- A new subject type gets a noun, page and field formats in `coreSubjectTypes`
  (`src/lib/activity.ts`), or, for a module's records, in its `subjects` in `src/lib/modules.ts`.
  Its detail page shows `<ActivityCard type="…" id={…} />` (`#lib/components/activity/`).
- Log deletions too: a subject links to its page until its deletion (or removal) is logged.
- Changes made outside the app's transactions (better-auth's member and invitation endpoints) log
  with `recordActivityAfter()` once they succeed. Pass `by` (tenant and user) when the change
  belongs to another organization than the current one, e.g. accepting an invitation.
- An order's lines are logged by `saveOrderLines()` (`src/lib/server/orders.ts`); stock that
  follows an order's status needs no entry of its own beyond the status change.

## Translations

The app is in English (the base locale) and Dutch, with Paraglide JS 2. The language comes from the
`PARAGLIDE_LOCALE` cookie (the language switchers set it and reload), else the browser's language,
else English; on the server `paraglideMiddleware` (`hooks.server.ts`) sets it per request, also for
remote functions. Every user-facing text goes through a message; nothing English is hard-coded.

- **Files**: `messages/<locale>/<section>.json`, one per section (`common`, `enum`, `validation`,
  `auth`, `dashboard`, `orders`, `schedule`, `customers`, `equipment`, `engineers`, `materials`,
  `contracts`, `invoices`, `settings`, `portal`, `activity`), each listed in
  `project.inlang/settings.json`. A new file goes in every locale folder and in that list.
- **Keys**: `<section>_<what>` in snake_case, e.g. `orders_title`, `orders_column_customer`,
  `orders_delete_refused`; shared UI is `common_*`. Add each key to `en` and `nl` together:
  `src/lib/i18n/messages.spec.ts` fails on a missing key, a key without its section prefix, or
  variables that differ between languages.
- **Using them**: `m.orders_title()` (auto-imported in `.svelte`; in `.ts`,
  `import { m } from "#lib/paraglide/messages.js"`). Variables: `"Delete {name}?"` →
  `m.customers_delete_title({ name })`; pass numbers as `formatNumber(n)` unless they're a plural's
  `count`. Plurals are variant messages on `count`, shown as `{countText}` (formatted), e.g.
  `"common_count_orders"` in `messages/en/common.json`; copy its shape.
- **Not at module scope**: a message, label or format call in a `.ts` module's top level (or a
  `<script module>`) runs once, so the server would render every request in the language of the
  first. Pass the message function where it's read later: column labels
  (`meta: { label: m.orders_column_customer }`), validation messages, `NumberCell`'s
  `format: m.common_count_units`. In component scripts, templates, `$derived` and function bodies
  (including remote functions) call it.
- **Enum values** (statuses, types, units, roles, …) are shown with `label("orderStatus", value)`
  from `#lib/i18n/labels.ts`, options with `labelOptions(kind, values, details?)` and display maps
  with `withLabels(kind, details)` (their `label` is a getter, read when shown). The texts are in
  `enum.json`; a new enum gets a kind there.
- **Validation**: valibot messages are message functions, e.g. `v.nonEmpty(m.orders_description_required)`
  or `(issue) => m.orders_quantity_max({ max: issue.requirement })`, so they're translated where the
  validation runs. The helpers in `#lib/schema.ts` take a `Message` and default to
  `validation.json`.
- **Server refusals**: `error(404, m.orders_not_found())`, `invalid(m.orders_delete_refused())` in
  the remote function's body, so they're in the request's language. Shared ones are
  `common_error_*` (`requireMember()` and friends use them).
- **Formatting**: money, dates, times and numbers only through `#lib/format.ts` (`formatCents`,
  `formatDate`, `formatDateTime`, `formatTime`, `formatNumber`; `dateFormatter(options)` and
  `numberFormatter(options)` for other formats, safe at module scope), never `new Intl.*("en-GB")`
  or `toLocaleString()`. Number and date inputs stay `type="number"`/`"date"`: the browser shows
  them in its own language and submits a dot and `yyyy-mm-dd`.
- **Stored text** (e.g. an invoice line's description) is in the language of whoever made it; store
  values and translate when showing where you can.
- **Dutch**: informal (`je`, never `u`), short, sentence case like the English. Terms: order →
  opdracht, schedule → planning, customer → klant, equipment → apparatuur (a unit → apparaat),
  engineer → monteur, engineer portal → monteursportaal, material → materiaal, stock → voorraad,
  service contract → servicecontract, response time → reactietijd, invoice → factuur, invoicing →
  facturatie, draft → concept, quote → offerte, VAT → btw, labour → arbeid, due date → vervaldatum,
  serial number → serienummer, manufacturer → fabrikant, warranty → garantie, organization →
  organisatie, member → lid, settings → instellingen, sign in/out → inloggen/afmelden, save →
  opslaan, cancel → annuleren, delete → verwijderen, edit → bewerken.
- **Tests** run in English: e2e browsers use `BROWSER_LOCALE` (pass it to every new browser
  context), so e2e and component tests keep asserting English texts; `e2e/i18n.test.ts` covers
  Dutch. Unit tests check Dutch output with the `locale` argument of the format helpers, or
  `overwriteGetLocale(() => "nl")` (see `src/lib/i18n/labels.spec.ts`).

## Tests

`pnpm test` runs everything: unit tests (`*.spec.ts` next to the code, in Node; `*.svelte.spec.ts`
in the browser) and the end-to-end tests in `e2e/`, which drive a production build of the app in
Chromium, one server and fresh, seeded database per test worker (see the Testing section of
README.md).

- A change to a section's behaviour gets an e2e test in that section's file
  (`e2e/<section>.test.ts`), written like the existing ones: tests are sequential steps sharing
  one signed-in page from `useApp()`, changes go through the UI, checks read the database with
  `rows()`/`value()`.
- Tenant isolation is part of every section's tests: South can't see or change North's records,
  including by tampering with hidden ids (`app.expectingErrors`).
- Pure helpers (validation, formatting, domain rules, form schemas, table columns) get unit tests
  next to them (`*.spec.ts`).
- Shared components get component tests next to them (`*.svelte.spec.ts`, rendered with
  `vitest-browser-svelte`). A component that needs a parent (a table, the theme provider) gets a
  `*.test-harness.svelte`; form fields take fakes of remote form fields from
  `src/lib/components/form/fake-form.ts`; remote functions are replaced with `vi.mock`.
- Test files run in parallel, each worker against its own database; within a file, tests run in
  order. A file may change data (through the UI), but must not rely on another file's changes.
- Only run one e2e run at a time: each run builds into `.svelte-kit/output`.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
