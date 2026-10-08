# File splits and cleanup

A review of file size, repetition and legibility, with a plan to fix them. No code has changed
yet. Two other plans cover nearby work and take precedence where they overlap:

- **(a) feature folders and module plugins**: where module code (contracts, invoicing) lives, and
  how modules hook into core. Any split below that moves module files should land in whatever
  folder (a) decides.
- **(b) the server-side table query system** (`table-query.ts`, `tableParams`, `ServerTable`,
  `url-state.ts`, `server-table.svelte.ts`). The list-query halves of the remote files below are
  theirs to reshape; this plan only moves them into files of their own.

Effort: **S** under an hour, **M** a few hours, **L** a day or more. Value: how much easier the
code becomes to read and change, not only lines saved.

---

## A. Splitting long files

Measured with `wc -l` over `src` and `e2e` (paraglide output left out). The target is under ~300
lines.

### A.0 Remote files can't re-export: update the imports

A `.remote.ts` file may only export remote functions, and SvelteKit identifies each one by
**the file it's exported from plus its name**. `init_remote_functions` (in
`@sveltejs/kit/src/exports/internal/server/remote-functions.js`) sets `fn.__.id = hash/name` for
every export of every remote module it loads. A barrel `orders.remote.ts` that re-exports
`getOrders` from `order-list.remote.ts` would overwrite that id on the same function object with
the barrel's hash, depending on which module loaded last. The client would then call one id and
`requested(getOrders)` / single-flight refreshes would look for the other. **No barrels: every
split updates its importers' paths.** There are only 3 to 10 importers per section, all in that
section's folder, so this is mechanical.

A remote file also can't export a plain helper, so a helper that two remote files share (e.g.
`removeOrder` for the single delete and the bulk delete) has to move to a plain module. Following
CLAUDE.md ("server-only code … always in `src/lib/server/`"), that module goes in
`src/lib/server/`. A simpler option is to keep each bulk command in the same file as the
single-record mutation it reuses, so the helper stays private. The proposals below do that
wherever the result still fits under 300 lines.

### A.1 Server: remote files

**`(app)/orders/orders.remote.ts`, 661 lines. Effort M, value high.** Split it into three remote
files and one server module:

- `order-list.remote.ts` (~230): `ordersTable`, `countOrders`, `getOrders`, `getOrderFacets`,
  `matchingOrderIds`. Plan (b) owns this one.
- `order.remote.ts` (~210): `getOrder`, `getOrderFormOptions`, `createOrder`, `updateOrder`,
  `deleteOrder`, `checkReferences`, `toIssue`, `saveOrder`.
- `order-bulk.remote.ts` (~110): `getAssignableEngineers`, `bulkAssignOrders`,
  `bulkSetOrderStatus`, `bulkDeleteOrders`, `targetOrders`, `refreshList`.
- `src/lib/server/order-changes.ts` (~130): `removeOrder`, `changeOrderStatus`, `assignOrder`,
  `notEditable`, `completedAt`. Both `order.remote` and `order-bulk.remote` use these.
- While moving `saveOrder`, have it throw `OrderStockShortage` and let `createOrder`/`updateOrder`
  turn that into the line's issue, as `portal.remote.ts` `saveMaterials` already does. Then no
  server module takes a form's `issue`.
- Importers: `+page.svelte`, `columns.ts` and `bulk-actions.ts` use the list and bulk files;
  `new/`, `[number]/`, `[number]/edit/` and `order-form.svelte` use `order.remote`.

**`(app)/invoices/invoices.remote.ts`, 502 lines. Effort M, value high.** Split it into four
files. Where they live depends on plan (a).

- `invoices.remote.ts` (~150): `getInvoices`, `getInvoice`, `getBillable`, `createInvoice`, and
  `getCustomers` renamed to `getInvoiceCustomers` (C.3).
- `invoice-status.remote.ts` (~150): `statusLabel`, `changeLabel`, `changing`, `orderIdsOf`,
  `recordOrderStatuses`, `issueInvoice`, `payInvoice`, `markPaid`, `bulkMarkPaid`,
  `voidInvoice`. It sits at `invoices/` because the list's `bulk-actions.ts` uses it.
- `[number]/draft.remote.ts` (~130): `subjectOf`, `recordLines`, `loggedLine`, `draftById`,
  `addToInvoice`, `addLine`, `removeLine`, `updateTerms`.
- `settings/settings.remote.ts` (~30): `getSettings` (renamed `getInvoicingSettings`),
  `saveSettings`.
- Both mutation files need `changed()` (rename it `refreshInvoice`, C.3), which refreshes 4
  queries. Put it in a plain `invoices/invoice-refresh.ts` that only remote files import, or
  repeat its 6 lines.

**`(app)/materials/materials.remote.ts`, 445 lines. Effort S, value medium.**

- `material-list.remote.ts` (~120): `materialsTable`, `countMaterials`, `getMaterials`,
  `getMaterialFacets`, `matchingMaterialIds`.
- `material.remote.ts` (~230): `ordersUsing`, `findMaterial`, `historyFits`, `sameName`,
  `getMaterial`, `createMaterial`, `updateMaterial`, `removeMaterial`, `deleteMaterial`,
  `bulkDeleteMaterials`. Keeping the bulk delete here keeps `removeMaterial` private; this file
  imports the list queries for `requested()`.
- `[sku]/stock.remote.ts` (~60): `receiveStock`, `countStock`. Only the two dialogs in `[sku]/`
  use them.

**`(app)/equipment/equipment.remote.ts`, 384 lines. Effort S, value medium.**

- `equipment-list.remote.ts` (~140): `equipmentTable`, `countEquipment`, `getEquipmentList`,
  `getEquipmentFacets`, `matchingEquipmentIds`.
- `equipment.remote.ts` (~250): the rest. That's the detail query, the form options, `checkUnit`,
  create, update, delete, and both bulk commands.

**`(app)/contracts/contracts.remote.ts`, 328 lines. Effort S, value low.** It's only just over
the limit. Move `checkContract`'s overlap query (lines 148–192, "is a unit already covered in this
period") to `src/lib/server/contracts.ts` next to `coverageOf`, as
`overlappingCoverage(equipmentIds, period, exceptId)`. With the shared number helper (B.4), that
brings it to ~250. No new remote file.

**`(field)/my/portal.remote.ts`, 310 lines.** Leave it. It's only just over, already well
organized, and everything in it shares `findMyOrder`. The tenant helpers (B.1) and the refusal
helper (B.5) bring it under 300.

**`lib/components/activity/activity.remote.ts`, 288 lines. Effort S, value medium.** It's under
the limit, but half of it is plain server logic. Move `lookUpNames`, `subjectStates` and
`present` (~140 lines) to `src/lib/server/activity-feed.ts`, leaving the 4 queries. That logic can
then get a unit test; today only e2e tests cover it.

**`(app)/settings/members/members.remote.ts`, 276 lines.** Leave it. It's one feature, and B.6
(roles) trims it.

### A.2 Server: other modules

| File                      | Lines | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Effort | Value |
| ------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lib/server/invoicing.ts` |   322 | Split along its own two halves. **Billable** (~150): `billableOrders`, `billedReferences`, `unbilledItems`, `billableFor`, `linesFor`, `alreadyBilled`. **Invoices** (~130): `settingsOf`, `createDraft`, `loadInvoice`, `invoiceById`, and the `invoicing: ServerModule` hook. Drop its own `Transaction` type (see C.4) and the unused `InvoicingSettings` export. Folder and names are plan (a)'s call, e.g. `src/lib/server/invoicing/{billable,invoices}.ts`.                                                                                                                                                                                                                                                        | S      | Med   |
| `lib/server/db/schema.ts` |   685 | **Exception.** It's a declarative catalog with clear section dividers. drizzle-kit reads one entry file (`drizzle.config.ts`), and splitting gains little. If plan (a) moves module tables beside their modules, a `schema/` folder with `core.ts`, `contracts.ts`, `invoicing.ts`, `views.ts`, `activity.ts` and an `index.ts` that re-exports them works too (drizzle-kit takes a folder or glob; migrations are keyed by table, not file). Check that `migrations.spec.ts` still passes with no diff.                                                                                                                                                                                                                  | –/M    | Low   |
| `lib/server/db/seed.ts`   | 1,356 | It's a script, not app code, but `generateTenant` is one **600-line function**. Make a `src/lib/server/db/seed/` folder: `index.ts` (tenants, writing, `linkDemoEngineer`; the entry point, so update `db:seed` in `package.json` and `e2e/global-setup.ts`), `places.ts` (towns, phone numbers, trades, institutions, `slug`), `customers.ts`, `engineers.ts`, `equipment.ts`, `materials.ts`, `orders.ts`, `contracts.ts` (terms and call-outs), `stock.ts`, `invoices.ts`. Each `generateX(faker, …)` takes what it needs and returns its rows; `generateTenant` just chains them. Keep the faker seeding order the same, or the demo data changes; compare a seeded `local.db` before and after with `sqlite3 .dump`. | L      | Med   |

### A.3 Svelte components

| File                                           | Lines | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Effort | Value |
| ---------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lib/components/data-table/data-table.svelte`  |   518 | **`pinning.svelte.ts`**: `widths`, `measurers`/`measure`, `Pin`, `pins`, `pinned()` and the class constants (`opaque`, `side`, `shadow`, `focusEdge`), as `createPinning(table)` returning `{ pinned, measure, offsetOf }` (~120 lines). **`track-overflow.ts`**: the `trackOverflow` attachment (~25). **`group-row.svelte`**: the `groupRow` snippet as a component (~95). **Page groups**: move the `grouped` derivation (~60) into `grouping.ts` as `groupedPage(table, groups)`, which is pure and testable. That leaves ~220 lines of markup and wiring. Coordinate with plan (b): it may change what `groups` looks like. | M      | High  |
| `(app)/orders/[number]/+page.svelte`           |   354 | **`order-lines-card.svelte`** (materials, labour, adjustments and total table, ~90). **`equipment-history-card.svelte`** (~45). The customer, equipment and engineer cards become shared cards (B.8). That leaves ~120.                                                                                                                                                                                                                                                                                                                                                                                                          | S      | Med   |
| `(app)/schedule/schedule-board.svelte`         |   329 | **`board-drag.svelte.ts`**: `dragging`, `target`, `moving`, `dragStart`, `dragOver`, `dragLeave`, `drop` as `createBoardDrag({ week, names })` (~70). **`week-grid.svelte`** (the wide engineers × days grid, ~100). **`day-list.svelte`** (the narrow list, ~30). **`backlog-card.svelte`** (~30). The board keeps the derived data, the dialog and the layout (~90).                                                                                                                                                                                                                                                           | M      | Med   |
| `(app)/orders/order-form.svelte`               |   314 | **`order-lines-field.svelte`** (the materials card with its table, add/remove and total, ~110), taking `fields.lines`, `materials` and the quoted prices. The rest of the form is ~200. B.8 (form shell) trims more.                                                                                                                                                                                                                                                                                                                                                                                                             | S      | Med   |
| `lib/components/data-table/saved-views.svelte` |   310 | **`save-view-dialog.svelte`**, **`rename-view-dialog.svelte`**, and the delete confirmation via the existing `form/delete-dialog.svelte` or a small `delete-view-dialog.svelte`. The menu stays (~150). The `run()` helper's error toast uses B.10.                                                                                                                                                                                                                                                                                                                                                                              | S      | Med   |
| `(app)/settings/members/+page.svelte`          |   298 | **`invite-card.svelte`**, **`members-card.svelte`**, **`invitations-card.svelte`**, all route-local. The page becomes ~50.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | S      | Low   |
| `(field)/my/[number]/+page.svelte`             |   256 | Under the limit. The labour and notes cards could follow `materials-form.svelte` / `complete-form.svelte` as `hours-form.svelte` and `notes-card.svelte`, for consistency within the folder.                                                                                                                                                                                                                                                                                                                                                                                                                                     | S      | Low   |

### A.4 Other TS modules

| File                                         | Lines | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Effort | Value |
| -------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lib/activity.ts`                            |   354 | **`activity.ts`** (~150): `Text`, `SubjectType`, `FieldFormat`, `actionVerbs`, `actionSentence`, `coreSubjectTypes` and its formatters, `subjectTypes`, `subjectHref`, `subjectNoun`, `subjectTypeLabel`. **`activity-format.ts`** (~150): `fieldLabels`, `fieldLabel`, `humanize`, `formatValue`, `describeChanges`, `referencedIds`, `Names`, `ReferenceType`/`referenceTypes`, `Change`. Only `activity.remote.ts` (or `activity-feed.ts`, A.1) imports the second. `activity.spec.ts` splits the same way. | S      | Med   |
| `lib/components/data-table/url-state.ts`     |   333 | **Plan (b)'s.** About 30 of its lines are the grammar table in the header comment; the code is cohesive. If (b) keeps it, an optional split is `url-codec.ts` (`splitValues`, `joinValues`, `searchString`, `encode`) beside it.                                                                                                                                                                                                                                                                               | –      | –     |
| `(app)/invoices/[number]/pdf/invoice-pdf.ts` |   251 | Leave it: one document's layout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | –      | –     |

### A.5 Tests

| File                                                                                                                                         |        Lines | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Effort | Value |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| `e2e/*.test.ts` (12 files over 300; `orders` 1,420, `contracts` 1,042, `equipment` 936)                                                      | 9,431 in all | **Allowed exception**: each file is a narrative of sequential steps on one page, and CLAUDE.md asks for one file per section. One split is still worth it. Files run in parallel, each on its own server and database, so the longest file sets the e2e wall-clock time. Splitting the independent `describe` blocks of the three largest files into `e2e/<section>.<aspect>.test.ts` (e.g. `orders.bulk.test.ts`, `orders.tenancy.test.ts`, `orders.i18n.test.ts`) would let them run side by side. First check that each block only relies on seeded data, not on earlier blocks' changes (e.g. "in South" in `orders.test.ts` creates its own order). Update CLAUDE.md's Tests section to allow `e2e/<section>.<aspect>.test.ts`. | M      | Med   |
| `e2e/app.ts`                                                                                                                                 |          415 | **`e2e/db.ts`** (`rows`, `value`, `countIn`, `unbalancedStock`, `nextCode`, `STANDARD_RATE`, `covered`, `PricedOrder`, `pricedOrders`, `priceOf`, `cents`), **`e2e/mail.ts`** (`SentMail`, `sentMail`, `linkInMail`), **`e2e/remote-functions.ts` (a file named `remote.ts` is taken for remote functions)** (`isRemote`, plus `tamperWithCommand` from `orders.test.ts`, with its `flatten`/`unflatten`, generalised for `views.test.ts`'s `tamperNextCommand`; see B.12), and **`e2e/app.ts`** (`useApp`, `App`, `TableGroup`, users, organizations). Re-export from `app.ts` so the tests' imports stay, or update them (13 files).                                                                                               | S      | Med   |
| `lib/components/data-table/table.svelte.spec.ts`                                                                                             |          615 | Split by the module under test. `describe("the URL")` (~110 lines) goes to `url-sync.svelte.spec.ts`. `describe("pinned columns")` (~110) goes to `pinning.svelte.spec.ts` once A.3 extracts it. The rest stays (~400; specs may be longer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | S      | Low   |
| `stock.spec.ts` 345, `table-query.spec.ts` 316, `url-state.spec.ts` 306, `server/activity.spec.ts` 302, `bulk-action-bar.svelte.spec.ts` 263 |            – | **Allowed exception**: unit specs mirror one module each, with `describe` blocks per function. Splitting them would scatter one module's tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | –      | –     |

---

## B. Repetition and composability

For each helper below: how many call sites it serves, roughly how much it removes, and whether
it's worth it. The rule of thumb is to extract what's repeated **and** must stay identical (tenant
scoping, numbering, refusals), and to leave flow that reads better spelled out (each section's
create and update forms) alone.

### B.1 Tenant-scoped `where` and join helpers (security, legibility)

There are **61** `and(eq(T.id, x), inTenant(T))`, **16** `and(inArray(T.id, ids), inTenant(T))`
and **41** `.innerJoin|leftJoin(T, and(eq(fk, T.id), inTenant(T)))`. In `src/lib/server/session.ts`:

```ts
/** A table with tenant rows: `{ id: SQLiteColumn; organizationId: SQLiteColumn }`. */
export type TenantTable = …;

/** `T.id = id` in the current tenant: the way to look a record up by an id from the client. */
export const idInTenant = (table: TenantTable, id: number) => and(eq(table.id, id), inTenant(table));
export const idsInTenant = (table: TenantTable, ids: number[]) =>
	and(inArray(table.id, ids), inTenant(table));
/** A join on `table` through `foreignKey`, kept in the tenant: `.leftJoin(...tenantJoin(engineer, order.engineerId))`. */
export const tenantJoin = <T extends TenantTable>(table: T, foreignKey: SQLiteColumn) =>
	[table, and(eq(foreignKey, table.id), inTenant(table))] as const;
```

That's 118 call sites. It removes few lines, but every lookup reads the same and carries the
tenant scope with it, and an `eq(T.id, id)` without `inTenant` stands out in review. Add a CLAUDE.md
line. **S to add, M to adopt** (mechanical, per section). **Value: high.**

### B.2 Bulk commands: `bulkChange`

Ten bulk commands repeat the same steps: `targetIds` → select `{id, label}` in the tenant, ordered by
label → `forEachRecord` → refresh. In `src/lib/server/bulk.ts`:

```ts
export async function bulkChange<T extends TenantTable, R extends { id: number }>(
	target: BulkTargetInput,
	{
		table,
		label,
		columns,
		matching,
		change,
	}: {
		table: T;
		label: SQLiteColumn; // e.g. order.number: shown in the result, and the order of work
		columns?: Record<string, SQLiteColumn>; // more fields `change` needs, e.g. the status
		matching?: MatchingIds;
		change: (record: R & { label: string }) => Promise<unknown>;
	},
): Promise<BulkResult>;
```

That serves 10 commands (orders 3, equipment 2, materials, customers, contracts, invoices, engineers),
saves about 7 lines each (~70), and replaces `targetOrders` and `targetEquipment`. Also give
`requested(q, 4).refreshAll()` a name: `refreshRequested(...queries)`, with the `4` as a named
constant (8 calls in 4 files, schedule included). **S. Value: medium.**

### B.3 Deleting a record: `deleteAndLog`

`removeCustomer`, `removeEquipment`, `removeMaterial` and `deleteEngineer` end with the same
9 lines: `refuseIfReferenced(() => db.transaction(tx => { delete where idInTenant;
recordActivity(deleted) }), message)`. In `src/lib/server/activity.ts` (or a new
`src/lib/server/records.ts`):

```ts
/** Deletes one of the tenant's records and logs it, refusing with `referenced` if rows still refer to it. */
export const deleteAndLog = (table: TenantTable, subject: Subject, referenced: string) =>
	refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(table).where(idInTenant(table, Number(subject.id)));
				await recordActivity(tx, { action: "deleted", subject });
			}),
		referenced, // e.g. m.customers_delete_referenced(): each section keeps its own message
	);
```

The checks before it stay in each `removeX`, because they differ (counts of equipment and orders,
used materials). `removeOrder` (stock return) and `removeContract` (coverage first) keep their own
transactions.

That's 4 sites and ~30 lines, and the log-after-change rule is kept in one place. **Don't** do the
same for updates: the update-and-log shape is the example in CLAUDE.md, it varies (`ignore`, `note`,
a check in between), and a helper would hide which fields are compared. **S. Value: medium.**

### B.4 Sequential codes and numbers

There are five copies of "max of the numeric suffix, plus one, padded", each with its prefix length
as a magic `substr` position: `orders.remote.ts:367` (10), `contracts.remote.ts:229` (10),
`customers.remote.ts:132` (6), `materials.remote.ts:270` (5), and `invoicing.ts:265`
(`SEQUENCE_START`). The seed and the e2e `nextCode` hold the formats a sixth and seventh time.

```ts
// src/lib/numbering.ts: pure, so the seed and the e2e helpers share it
export const numberFormats = {
	customer: { prefix: "CUST-", digits: 4 },
	material: { prefix: "MAT-", digits: 4 },
	order: { prefix: "ORD-", digits: 5, yearly: true }, // ORD-2026-00001; the sequence runs on across years
	contract: { prefix: "CTR-", digits: 4, yearly: true },
	invoice: { prefix: "INV-", digits: 5, yearly: true },
} as const;
// Not `formatNumber`, which `#lib/format.ts` already has.
export function formatCode(kind, sequence, year = new Date().getFullYear()): string;
export const sequenceStart = (kind) => prefix.length + (yearly ? 5 : 0) + 1; // 1-based, for substr

// src/lib/server/numbering.ts
/** The tenant's next code or number of `kind`; call it in the transaction that inserts it. */
export async function nextNumber(tx: Transaction, kind, column: SQLiteColumn, table: TenantTable);
```

That's 5 server sites (~30 lines), plus the seed and e2e. It also stops the `substr` offset from
drifting from the format. `invoiceNumber` and `SEQUENCE_START` in `lib/components/invoicing/invoice.ts`
fold into it. **S. Value: medium.**

### B.5 Refusing with a form's issues

There are 7 copies of `if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)))`
(orders ×2, equipment ×2, contracts ×2, portal), with a per-section `type Problem = { field: …;
message }`. In `src/lib/server/forms.ts`:

```ts
export interface Problem<F extends string = string> {
	field?: F;
	message: string;
}
/** Refuses the form with each problem on its field (or the form, without one), if there are any. */
export function refuse<F extends string>(
	issue: Record<F, (message: string) => unknown>,
	problems: Problem<F>[],
);
```

The order form's line problems (`issue.lines[i][field]`) keep their own `toIssue`, which can call
it. That's ~7 lines, but it gives one `Problem` type instead of four (`DraftProblem`, the schedule's
`Problem` and orders' `Problem` already differ only in their fields). **S. Value: low to medium.**

### B.6 Roles: one list, one parser

- `["owner", "admin"]` is defined 4 times: `members.ts` `managerRoles`, and a local `managers` in
  `settings.remote.ts`, `invoices.remote.ts` and `engineers/[id]/edit/account.remote.ts`. Each
  file also hand-rolls `tenant.roles.some((role) => managers.includes(role))`, which already exists
  as `canManageMembers`.
- Splitting `role` on commas is done 5 times: `members.ts` `parseRoles`, `session.ts:53`,
  `activity.ts:168`, `settings.remote.ts:34`, `create-organization-args.ts:92`.

Fix: move `parseRoles`, `managerRoles` and `isManager(roles)` (renamed from `canManageMembers`) to
`src/lib/roles.ts`, and add `requireManager()` to `session.ts` (= `requireRole(...managerRoles)`).
That's 9 sites. **S. Value: medium** (a role change now touches one line).

### B.7 Pricing SQL

`sum(round(quantity * unitPrice))` is written 5 times (orders, customers, materials,
`invoicing.ts`, `dashboard.remote.ts`). It's the SQL twin of `lineTotal()` in `models.ts`, and must
round the same way. Three of them (customers, invoicing, dashboard) build the same "materials per
order" subquery to feed `priceOrders()`. In `src/lib/server/pricing.ts`, add `lineTotalSql(line)`
and `materialsPerOrder()` (the subquery), next to `priceOrders`. That's ~25 lines, and the rounding
rule lives in one place. **S. Value: medium.**

### B.8 Pages: breadcrumbs, stat tiles, contact cards, form shell, submit buttons

| Pattern                                                                                                                                       | Sites                                                                        | Proposal                                                                                                                                                                                                                                                                                                       | Saves      | Effort | Value |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----- |
| `<Breadcrumb.Root>…` (13 to 18 lines of markup)                                                                                               | 22 pages                                                                     | A `breadcrumbs={[{ label, href }, …, { label }]}` prop on `PageHeader` (the last item is the current page). Keep `children` for anything else.                                                                                                                                                                 | ~220 lines | S+M    | High  |
| Stat tile (`Card` + `text-3xl tabular-nums` value + label)                                                                                    | 19 tiles in 5 files (dashboard, customer, engineer, material, service stats) | `#lib/components/stat-card.svelte` (`label`, `value`, `detail?`, `size?`)                                                                                                                                                                                                                                      | ~120 lines | S      | Med   |
| Customer contact card (name/link, contact, email, phone, place)                                                                               | 4 (orders, contracts, equipment, customer pages)                             | `#lib/components/customers/customer-card.svelte` (`customer`, `title`); same for `engineers/engineer-card.svelte` and `equipment/equipment-card.svelte` if a second page needs them                                                                                                                            | ~80 lines  | S      | Med   |
| Record form shell: `form.enhance` + success toast, hidden `id` with a `(form as typeof updateX)` cast, form-level `FieldError`, `FormActions` | 6 forms (customer, engineer, equipment, material, order, contract)           | `#lib/components/form/record-form.svelte` with `form`, `id?`, `saved`/`created` toasts, `submitLabel`, `cancelHref`, `children`. It also removes the 6 casts. The generic type of a remote form is awkward to take as a prop; if it fights back, keep the shell and only extract `<HiddenId {form} id={…} />`. | ~70 lines  | M      | Med   |
| Submit button with `{#if x.pending}<Spinner/>{:else}<Icon/>{/if}`                                                                             | 26 in 15 files                                                               | `#lib/components/form/submit-button.svelte` (`pending`, `icon?`, `variant?`, children). `FormActions` uses it too.                                                                                                                                                                                             | ~100 lines | S      | Med   |

### B.9 Columns

- `header: ({ header }) => renderComponent(header.ColumnHeader)` appears **52** times in the 7
  `columns.ts` files. Make it the default in `table.svelte.ts`'s `defaultColumn` (which already
  exists for `enableGrouping`), and give display columns without a header (`actions`) an explicit
  `header: ""`. Check that hidden search-only columns and `view-options.svelte` don't rely on the
  string header. That saves ~52 lines. **S. Value: medium.**
- The `select` display column is identical in all 7 files. Add `column.select()` (or a
  `selectColumn` export) in `table.svelte.ts`. That saves ~40 lines. **S. Value: low.**
- Customer columns (orders, equipment, contracts, invoices) render `CustomerLink` the same way
  with `filterFn` by code and `getGroupingValue`. A `customerColumn(column, label)` helper is
  tempting but the four differ in their `meta` and filtering (client vs server). **Leave them.**

### B.10 Small client helpers

- `isHttpError(error) ? error.body.message : fallback` is repeated in `bulk-action-bar.svelte`,
  `saved-views.svelte` and `schedule-board.svelte`. Add `errorMessage(error, fallback)` in
  `#lib/utils.ts`. **S. Value: low.**
- Bulk delete actions (`customers`, `materials`, `equipment`, `contracts`, `orders`) are the same
  object with a different `skip`, title, description and `run`. A `deleteAction({ … })` factory in
  `bulk-actions.ts` would save ~6 lines each (~30). **S. Value: low.** Optional.

### B.11 Form and filter options

`select id, code, name from customer where inTenant order by name` appears 4 times
(`getOrderFormOptions`, `getEquipmentFormOptions`, `getContractFormOptions`, invoices'
`getCustomers`), and the equipment options twice (orders, contracts). Add `customerOptions()` and
`equipmentOptions(extra?)` in `src/lib/server/options.ts`, with the shared column sets, e.g.
`customerRef = { id, code, name }`, which list selects repeat 9 times. That's ~35 lines.
**S. Value: low to medium.**

### B.12 E2E

- Move `tamperWithCommand` (+`flatten`/`unflatten`) from `orders.test.ts` to `e2e/remote-functions.ts` (a file named `remote.ts` is taken for remote functions) and
  build `views.test.ts`'s `tamperNextCommand` on it. Tenant-isolation tests elsewhere (equipment,
  materials, customers, contracts, invoices bulk actions) can then cover "a bulk action with
  another tenant's ids", which only orders tests today. That's a coverage gain more than a line
  saving. **S. Value: medium.**
- Each file's `snapshot(id)` is a one-line `rows(select * …)`. **Leave it.**

### B.13 Date constants

`const DAY = 24 * 60 * 60 * 1000` appears in 5 files, and next-day/start-of-day helpers in 3
(`contracts.remote.ts` `nextDay`, `activity.remote.ts` `dayAfter`/`startOf`,
`service-history.ts`). Add `src/lib/dates.ts` (`DAY`, `addDays`, `startOfDay`, `nextDay`), or put
them in `#lib/schema.ts` next to `atTime`/`toDateInput` (but see C.6). **S. Value: low.**

---

## C. Understandability

### C.1 Dead code

There's no `knip` in the project. A scratch script that greps each export's name across `src` and
`e2e` found:

- `isOutstanding` in `lib/components/invoicing/invoice.ts:71`: never used. Remove it.
- `InvoicingSettings` type in `lib/server/invoicing.ts:50`: never used. Remove it.
- ~40 exported types and constants are used only in their own file (e.g. `BulkSkip`,
  `Applicability`, `MatchingIds`, `DAILY_CAPACITY`, `ACTIONS_COLUMN`, `stockHoldingStatuses`). That's
  harmless, but drop the `export` where nothing outside needs it. The relations in `schema.ts` and
  `auth.schema.ts` are used by drizzle through the schema object: keep them.

Consider adding `knip` as a dev dependency with a config that ignores `components/ui` and
paraglide. **S. Value: low.**

### C.2 Misplaced modules (vs "Where files go")

The placement is clean: no route-local file is imported from outside its folder, and every remote
file sits at the nearest common folder of its users. Three single-user modules are in `src/lib`:
`engineers/active-badge.svelte` (engineers only), `materials/stock-badge.svelte` (materials only),
and `equipment/equipment-link.svelte` (the order page only). They belong to a family of
per-entity links and badges that other sections reach for, so moving them would be churn. Instead,
add an exception to CLAUDE.md: "an entity's links, badges and display maps live in
`#lib/components/<entity>/` even with one user". Similarly, non-component domain modules sit in
`lib/components/<entity>/` (`invoice.ts`, `coverage.ts`, `billing.ts`, `countries.ts`, `display.ts`).
That's plan (a)'s question for the module ones; for core, `display.ts` there is fine.

### C.3 Names that collide or mislead

| Name                                                                 | Problem                                                                                                            | Rename                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `getCustomers` in `invoices.remote.ts`                               | Same name as `customers.remote.ts` `getCustomers`, which returns something else (with counts)                      | `getInvoiceCustomers` (or B.11's shared options)                                                                                         |
| `getMaterials` in `portal.remote.ts`                                 | Same name as the office's `getMaterials` (a table page)                                                            | `getUsableMaterials`                                                                                                                     |
| `getSettings` in `invoices.remote.ts` and `settings.remote.ts`       | Two different settings                                                                                             | `getInvoicingSettings`, `getOrganizationSettings`                                                                                        |
| `getEquipmentList` vs `getOrders`/`getMaterials`                     | The list query is named differently because "equipment" is uncountable; fine, but the single one is `getEquipment` | Keep; note it in the file's header                                                                                                       |
| `changed(found)` in `invoices.remote.ts`                             | Reads as a predicate                                                                                               | `refreshInvoice(found)`                                                                                                                  |
| `refresh(number)` in `portal.remote.ts`                              | Shadows nothing but says little                                                                                    | `refreshMyOrder(number)`                                                                                                                 |
| `subjectOf` (3 files), `{ type: "order", id, label }` (~35 literals) | Subject types are free strings, so a typo is only caught by tests                                                  | `subject("order", id, label)` typed against `coreSubjectTypes` keys plus modules' `subjects`; plan (a) may want this for module subjects |

### C.4 One `Transaction` type

`Transaction` is defined 3 times: `server/stock.ts:25`, `server/invoicing.ts:69` and
`db/seed.ts:1259`. `server/activity.ts` and `server/orders.ts` import it **from `stock.ts`**,
which reads as if activity depended on stock. Define it once in `src/lib/server/db/index.ts` next
to `db` and import it from there. **S. Value: medium** (it's also what `serialize.ts` is about).

### C.5 Inconsistent shapes between sections

- **Single-record delete helpers.** Orders, materials, equipment, customers and contracts have a
  `removeX(id)` shared by the page's delete and the bulk delete. Engineers inline the delete in
  `deleteEngineer` and have no bulk delete (it has `bulkSetEngineersActive`). That's fine
  functionally, but extract `removeEngineer` for symmetry, or note why there's no bulk delete.
  B.3 makes all of them short.
- **Bulk targets.** Server-side tables pass `matching` (orders, equipment, materials); client-side
  tables only ids. This is intentional, so document it in `bulk.ts`'s header (it says "a table
  without it only takes ids", which is enough) and keep B.2's `matching` optional.
- **Refresh after a mutation.** Client-side lists call `getX().refresh()` on the server.
  Server-side lists use `requested(...)` on the server and `.updates(...)` in the client action.
  Both are right for their table kind, but a reader has to work that out. Add one paragraph to
  `bulk.ts` (or B.2's helper doc) saying which to use when.
- **Badges.** `orders/status-badge.svelte` and `contracts/level-badge.svelte` read
  `{icon, variant, label}` from `display.ts`. `equipment/status-badge.svelte` keeps its variants
  inline and has no icon. Move equipment's into `equipment/display.ts` like the others. Optionally
  have the 8 icon+label badges render one `display-badge.svelte` (saves ~5 lines each, low value).
- **Import extensions.** 105 relative imports end in `.ts` and 84 in `.js`. `.ts` is needed in
  files that node runs directly (seed, `create-organization`) and what they import, but
  `invoicing.ts` and `members.ts` mix both styles. Pick one rule ("`.ts` everywhere", since
  `allowImportingTsExtensions` is on) and let the formatter or a lint rule hold it. **S. Value: low.**

### C.6 Modules doing two jobs

- `#lib/schema.ts` holds valibot field helpers **and** date helpers (`atTime`, `timeOfDay`,
  `toDateInput`) that components and the board use without any validation. Move the date helpers
  to `#lib/dates.ts` (B.13). **S. Value: low.**
- `lib/server/invoicing.ts` imports `getOrderInvoice` from `lib/components/invoicing/invoicing.remote.ts`,
  which imports `invoicing.ts` back (a cycle; the comment at line 24 says so). Leave this to plan
  (a)'s module hooks, which should give `orderSaved` a way to refresh without the server module
  importing a remote file.

### C.7 Stale or wrong comments

- `table.svelte.ts:67` and `table-query.ts:37` refer to `server-table.ts`; the file is
  `server-table.svelte.ts`.
- `server-table.svelte.ts:16` has a line that runs past the formatter's width inside the doc
  comment ("…the sorting or the grouping changes (so those don't count again). Both are the
  table's own parameters, in a fixed"). Reflow it.
- `orders.remote.ts:365` says "Numbers are sequential per tenant, across years". That's true, but
  the `substr(…, 10)` that makes it so is only explained in `contracts.remote.ts:226`. B.4 removes
  both.

### C.8 Large prop lists and casts

There are no components with unwieldy prop lists; the largest take 4 to 6 props. The recurring
smell is the `(form as typeof updateX).fields.id` cast in 6 forms (B.8's form shell), and
`as never` in `data-table.svelte`'s group row (lines 88–90, 480), which A.3's `group-row.svelte`
should keep commented as it is now.

### C.9 Client/server type duplication

There's little: client code derives row types from the queries
(`Awaited<ReturnType<typeof getX>>`), which is the right pattern. One exception: `OrderBulkRow` in
`#lib/modules.ts` restates part of `OrderRow`. That's plan (a)'s, since it's the module contract.

---

## Order of work

The batches are sized for one agent each. Agents in the same batch touch disjoint files and can
run in parallel. Each batch merges before the next starts. Per CLAUDE.md, each agent runs only the
tests for its files; the coordinator runs `pnpm run check` and `pnpm test` after merging each
agent's branch, one at a time.

### Batch 0: shared helpers (one agent, first)

These are small additions that the section agents then adopt. Adopting them only in `src/lib/server`
and `src/lib/components` keeps this batch off the route files.

1. C.4: one `Transaction` in `db/index.ts`.
2. B.1: `idInTenant`, `idsInTenant`, `tenantJoin` in `session.ts` (+ spec), and a CLAUDE.md note.
3. B.4: `#lib/numbering.ts` + `server/numbering.ts` (+ specs); adopt in `invoicing.ts`.
4. B.6: roles in `roles.ts`, `requireManager()`; adopt in `session.ts`, `activity.ts` and `members.ts`.
5. B.7: `lineTotalSql`, `materialsPerOrder` in `pricing.ts`.
6. B.2, B.3, B.5: `bulkChange`, `refreshRequested`, `deleteAndLog`, `refuse`.
7. B.8 components: the `PageHeader` `breadcrumbs` prop, `stat-card.svelte`, `submit-button.svelte`,
   `customer-card.svelte`, and `record-form.svelte` if it types cleanly (component tests for
   each). B.9: the `defaultColumn` header and the select column. B.10 `errorMessage`. B.13
   `dates.ts`.
8. C.1 dead code, C.7 comments.

### Batch 1: sections (parallel; one agent per row)

Each agent splits its section's files (A), adopts batch 0's helpers there (tenant helpers, bulk,
delete, numbering, refusals, breadcrumbs, stat cards, contact cards, submit buttons, columns'
default header), and renames per C.3.

| Agent                                    | Files                                                                                                                           | Conflicts to watch                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **orders**                               | `routes/(app)/orders/**` (A.1, A.3 page and form), `server/order-changes.ts`, `server/orders.ts`                                | Plan (b) on `order-list.remote.ts`: move it unchanged, don't reshape it                         |
| **invoicing**                            | `routes/(app)/invoices/**`, `server/invoicing.ts` (A.1, A.2)                                                                    | Plan (a) decides the folders; run after it, or in its branch                                    |
| **materials + equipment**                | `routes/(app)/materials/**`, `routes/(app)/equipment/**`                                                                        | Plan (b) on the list files                                                                      |
| **customers, engineers, contracts**      | `routes/(app)/{customers,engineers,contracts}/**`, `server/contracts.ts`                                                        | Plan (a) for contracts                                                                          |
| **schedule, members, portal, dashboard** | `routes/(app)/schedule/**`, `routes/(app)/settings/**`, `routes/(field)/**`, `routes/(app)/+page.svelte`, `dashboard.remote.ts` | –                                                                                               |
| **activity**                             | `lib/activity.ts`, `lib/components/activity/**`, `server/activity-feed.ts` (A.1, A.4), the typed `subject()` helper (C.3)       | Plan (a) for module subject types                                                               |
| **seed**                                 | `server/db/seed.ts` → `seed/` (A.2), using `#lib/numbering.ts`                                                                  | `package.json` and `e2e/global-setup.ts` script paths                                           |
| **e2e support**                          | `e2e/app.ts` split, `e2e/remote-functions.ts` (a file named `remote.ts` is taken for remote functions) (A.5, B.12)              | Touches every test file's imports unless `app.ts` re-exports; keep the re-exports in this batch |

### Batch 2: after plan (b) lands

- **data table**: `data-table.svelte` (pinning, overflow, group row, page groups),
  `saved-views.svelte` dialogs, the `table.svelte.spec.ts` split (A.3, A.5). Doing this before (b)
  merges would conflict on `grouping.ts` and the `groups` prop.

### Batch 3: optional, any time after batch 1

- Split the three largest e2e files by independent `describe` blocks (A.5), and update CLAUDE.md.
  Do one file first and measure the e2e wall-clock time before doing the rest.
- `knip` in dev dependencies (C.1), and the import-extension rule (C.5).
- `schema.ts` split, only if plan (a) wants module tables beside their modules (A.2).
