## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: vitest, tailwindcss, sveltekit-adapter, drizzle, better-auth, paraglide, ai-tools, experimental

## Where files go

Put a module next to the code that uses it, in the nearest folder that contains all of its users.

- **Used by one route** (components, `*.remote.ts`, helpers, their tests): in that route's folder, e.g. `src/routes/(app)/orders/orders-table.svelte`. Only `+`-prefixed files are routes, so these are ignored by the router.
- **Used by several routes under one folder**: in that folder, e.g. `src/routes/(app)/orders/orders.remote.ts` serves `/orders` and `/orders/[number]`, and `src/routes/(app)/app-sidebar.svelte` serves every route behind the login. Import it relatively (`../orders.remote.js`).
- **Used across unrelated parts of the app**, or generic and route-independent (shared UI such as `#lib/components/data-table`, themes, formatting, domain enums): in `src/lib`, imported via `#lib/...`.
- **Server-only code** (database, secrets, auth): always in `src/lib/server/`, whoever uses it, so SvelteKit keeps it out of client bundles.

When a module gains a user outside its folder, move it up to the nearest common folder (or `src/lib`); when it loses users, move it down.

## Tenants and modules

The app is multi-tenant: organizations (better-auth's organization plugin) own all business data, and
optional modules (`src/lib/modules.ts`) are enabled per organization (`organization_module`). The
helpers are in `src/lib/server/session.ts`:

- Every remote function starts with `requireMember()` (or `requireUser()` if it doesn't touch
  tenant data, or `requireModule("<id>")` in an optional module, which 404s when the organization
  doesn't have it, or `requireRole("owner", "admin")` for organization settings).
- Every select, update and delete on a tenant table (one with `organizationId`) includes
  `inTenant(table)` in its `where`, including lookups by id or code: ids are global and come from
  the client. Check that submitted references (e.g. a `customerId`) belong to the tenant, for a
  clear message (the foreign keys would refuse them anyway). `contract_equipment` has no
  `organization_id`: reach it through a tenant-checked contract or equipment.
- Inserts set `organizationId` from `requireMember()`. Codes and numbers are unique and sequential
  per organization: pick the next one and insert it in one `db.transaction` (transactions take
  turns, see `src/lib/server/db/serialize.ts`, so concurrent creates can't pick the same one).
- References between tenant tables are composite foreign keys that include the tenant, e.g.
  `(organization_id, customer_id)` → `customer (organization_id, id)`, and relations use the same
  column pairs, so the database refuses cross-tenant references and `with:` loads stay in the
  tenant. A new reference gets the same treatment; joins also add `inTenant()` for the joined
  table. Where a reference must belong to the same customer (an order's equipment, a contract's
  coverage), the key pairs `customer_id` instead.
- An optional module's tables reference core tables, never the reverse; core sections don't know
  about modules.

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
