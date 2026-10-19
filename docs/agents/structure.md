# Where files go

The full layout rules; `AGENTS.md` has the summary. `src/tests/unit/lib/domain-boundaries.spec.ts` and `import-extensions.spec.ts` enforce most of it.

Put a module next to the code that uses it, in the nearest folder that contains all of its users,
with two exceptions: **tests** are never next to their subject (they are in `tests/` folders, see
`tests.md`), and **`src/routes` holds route files only** (names starting with `+`), plus the files
of the app shell, the dashboard, the auth pages, the engineer portal (`(field)/my`) and the customer
portal (`(customer)/portal`), which belong to no core domain. Their extension points are in
`src/lib/portal/extensions.ts` (the engineer portal's) and `src/lib/client/extensions.ts` (the
customer portal's). Whatever belongs to a core domain lives in that domain's folder.

- **A core domain's code** (`orders`, `customers`, `equipment`, `engineers`): in
  `src/lib/<domain>/`, in a folder by feature. Its tests are not in it: see `tests.md`.
  - `ui/`: the small pieces other sections reuse: links, badges, labels, cards, tags
    (`#lib/orders/ui/order-link.svelte`).
  - `list/`: the list definition (`orders-list.ts`), columns, table, cells, bulk actions, and the
    list's remote functions (`order-list.remote.ts`, `order-bulk.remote.ts`).
  - `form/`: the new/edit form, its fields and valibot schema.
  - `detail/`: what only the detail page shows: cards, history, dialogs, their helpers and remote
    functions.
  - `server/`: server-only code: services (`pricing.ts`, `lifecycle.ts`), hooks, and the list's `ListSql`
    in `list-sql.ts`.
  - at the root: `display.ts` (display maps, options, domain rules), `extensions.ts` (the domain's
    extension points), browser-safe rules the server shares (orders' `lifecycle.ts`, the transition
    table), `countries.ts`-like data, and the record's own remote functions
    (`order.remote.ts`: get, form options, create, update, delete).

  A page is a `+page.svelte` in `src/routes/(app)/<domain>/` that composes these.

- **Barrels**: code outside a domain imports it through its barrels, by file: `#lib/<domain>/index.ts`
  (plain TS: display maps, list definitions, data; safe to load anywhere Vite's Svelte plugin runs),
  `components.ts` (Svelte components), `remotes.ts` (re-exports the `*.remote.ts` files; not named
  `remote.ts`, which SvelteKit would treat as a remote module) and `server/index.ts` (server-only;
  orders and equipment have one: add one when something outside needs it).
  E.g. `import { OrderLink } from "#lib/orders/components.ts"`. A barrel exports what something
  outside the domain imports, no more. Exceptions: `#lib/<domain>/extensions.ts` is imported as itself
  (the module generator reads it and the modules contribute to it at module scope), and the tests (`src/tests/` and
  the modules' `tests/` folders, which reach into what they test) and `scripts/`, which have no Vite
  plugins and import plain `.ts` files by path. Inside a domain, import
  siblings relatively and never the domain's own barrels (a barrel imports its files: the other way
  round is a cycle). Code that runs when a module is evaluated (list definitions, `withLabels()`,
  constants) never reads an import from another domain: a cycle between two barrels is harmless only
  if nothing is read while they evaluate. `src/tests/unit/lib/domain-boundaries.spec.ts` checks all of this, and
  that a domain's route folder and a module's `routes/` hold `+` files only.
- **Used by one route outside the domains** (the shell, dashboard, auth pages, portal):
  in that route's folder, e.g. `src/routes/(app)/(dashboard)/dashboard-charts.ts`. **Used by several
  routes under one folder**: in that folder, e.g. `src/routes/(app)/app-sidebar.svelte` serves every
  route behind the login. Import it relatively. Plain helpers that a route's remote files share (a
  `.remote.ts` may only export remote functions) go in a `*.server.ts` next to them, which SvelteKit
  keeps out of client bundles.
- **Generic, domain-free code** (UI kit, data table, forms, themes, activity subjects, auth,
  i18n, module manifests, extension point declarations): `src/lib/components/`, `src/lib/activity/`,
  `src/lib/auth/`, `src/lib/i18n/`, `src/lib/modules/`, `src/lib/extensions/`, `src/lib/themes/`;
  the loose `src/lib/*.ts` that remain are domain enums (`models.ts`), valibot blocks
  (`schema.ts`), the time zone and Temporal's transport (`dates.ts`), code shapes (`numbering.ts`), what's billed besides
  orders (`billing.ts`, types the seed shares with invoicing) and shadcn's `cn` (`utils.ts`).
  Infrastructure on the server (database, auth, activity log, list plans and bulk helpers, mail,
  the modules' route guards): `src/lib/server/db/`, `server/auth/`, `server/activity/`,
  `server/lists/`, `server/mail/`, `server/modules/`; the loose `src/lib/server/*.ts` that remain
  are `extensions.ts` (the hooks' dispatch), `forms.ts`, `records.ts` and `numbering.ts`.
- **An optional module** (something a tenant can switch off, like contracts and invoices): everything of it in `src/modules/<id>/`, whoever uses it, see `modules.md`. Its server-only code is in the module's `server/` folder, and what other modules may use is in its `api/` folder. Core code never imports from `src/modules/`.

**Imports name a file by its real extension**: `.ts` for TypeScript (`allowImportingTsExtensions` is
on, and plain Node, which runs the seed, `org:create` and `scripts/modules.ts`, needs it), `.svelte.ts`
for rune modules, `.svelte` for components, and `.js` only for real JavaScript, which is paraglide's
generated output (`#lib/paraglide/messages.js`, `runtime.js`). So `../order.remote.ts`, never
`../order.remote.js` or `../order.remote`; the same goes for `vi.mock(...)` paths and `import()`.
`import-extensions.spec.ts` fails with the file and line of an import that breaks this. The
`#ui/<name>` imports have no extension: `package.json` adds `/index.ts` (it maps shadcn's component
folders, which the shadcn CLI and the auto-imports rely on). Seven generic folders also have
a barrel `index.ts` re-exporting their files (`activity/`, `auth/`, `i18n/` and `server/activity/`,
`server/auth/`, `server/lists/`, `server/mail/`), and so does each core domain (above); a barrel is
imported by that file, `#lib/i18n/index.ts`: no `package.json` `imports` entry or `tsconfig` path maps
a folder to its `index.ts`, so a folder is never imported as `#lib/i18n`
(`import-extensions.spec.ts` fails with the line).

Any `server/` folder outside `src/routes` (and any `*.server.ts`) is server-only: SvelteKit refuses to bundle it for the browser (`server_only_import`). Never put secrets or database code anywhere else.

When a module gains a user outside its folder, move it up to the nearest common folder; when it loses users, move it down.
