# Tenancy

How tenant data stays in its tenant, and the shared server helpers. `AGENTS.md` has the rules every change needs; this is the detail.

The app is multi-tenant: organizations (better-auth's organization plugin) own all business data, and
optional modules (`src/modules/<id>/`, see `modules.md`) are enabled per organization (`organization_module`). The
helpers are in `src/lib/server/auth/session.ts`:

- Every remote function is made with a gated set from `src/lib/server/remote-functions.ts`, the
  only file that may import `query`, `form` and `command` from `$app/server`
  (`remote-functions.spec.ts` checks): `forMembers.query(schema, handler)` for the office,
  `forManagers` (an owner or admin) for organization settings, `forEngineers` for the engineer
  portal, `forUsers` if it doesn't touch tenant data, `forAnyone` only for what's public on purpose
  (signing in, the theme, an invitation's link); an optional module uses its own set (see `modules.md`). The set runs its gate (`requireMember()` and friends) before the handler on every
  call, so the handler doesn't check again: it reads what the gate admitted with `currentTenant()`
  (`organizationId`, `roles`, `modules`, `user`), `currentUser()` or `await currentEngineer()`.
- Every select, update and delete on a tenant table (one with `organizationId`) includes
  `inTenant(table)` in its `where`, including lookups by id or code: ids are global and come from
  the client. Check that submitted references (e.g. a `customerId`) belong to the tenant, for a
  clear message (the foreign keys would refuse them anyway). Write the tenant scope with
  `idInTenant(table, id)` and `idsInTenant(table, ids)` (`session.ts`) instead of spelling out
  `and(eq(table.id, id), inTenant(table))`, and a join to a tenant table with
  `.leftJoin(...tenantJoin(engineer, order.engineerId))`: a bare `eq(table.id, id)` then stands out
  in review. `contract_equipment` has no `organization_id`: reach it through a tenant-checked
  contract or equipment.
- Inserts set `organizationId` from `currentTenant()`. Codes and numbers are unique and sequential
  per organization: pick the next one with `nextNumber(tx, "order")` (`src/lib/server/numbering.ts`;
  the formats are in `src/lib/numbering.ts`) and insert it in the same `db.transaction`
  (transactions take turns, see `src/lib/server/db/serialize.ts`, so concurrent creates can't pick
  the same one). A module numbers its own records with a format and table of its own:
  `nextNumber(tx, { format, table, column })`, e.g. `contractNumbers` in
  `src/modules/contracts/server/contracts.ts` and `invoiceNumbers` in
  `src/modules/invoices/server/invoices.ts`. An order is created only through
  `createOrders(tx, drafts)` (`src/lib/orders/server/creation.ts`, in `#lib/orders/server/index.ts`),
  which checks each draft's customer, unit and engineer, numbers, inserts and logs it: core's order
  form calls it (and saves its modules' parts with `saveOrderParts()` after it, see below), and so
  do the modules (maintenance's "Create orders"). It doesn't emit `orders.committed`, which is for orders the
  client's pages already show.
- References between tenant tables are composite foreign keys that include the tenant, e.g.
  `(organization_id, customer_id)` → `customer (organization_id, id)`, and relations use the same
  column pairs, so the database refuses cross-tenant references and `with:` loads stay in the
  tenant. A new reference gets the same treatment; joins also add `inTenant()` for the joined
  table. Where a reference must belong to the same customer (an order's equipment, a contract's
  coverage), the key pairs `customer_id` instead.

- Shared server helpers, so each section doesn't write them again: `bulkChange()` and
  `refreshRequested()` for bulk commands (`lists/bulk.ts`), `deleteAndLog()` for deleting a record
  (`records.ts`), `refuse()` for refusing a form with its problems and `refuseOffParts()` for a
  form slot's parts (`forms.ts`).
