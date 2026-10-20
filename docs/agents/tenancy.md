# Tenancy

How tenant data stays in its tenant, and the shared server helpers. `AGENTS.md` has the rules every change needs; this is the detail.

The app is multi-tenant: organizations (better-auth's organization plugin) own all business data, and
optional modules (`src/modules/<id>/`, see `modules.md`) are enabled per organization (`organization_module`). The
helpers are in `src/lib/server/auth/session.ts`:

- Every remote function is made with a gated set from `src/lib/server/remote-functions.ts`, the
  only file that may import `query`, `form` and `command` from `$app/server`
  (`remote-functions.spec.ts` checks): `forMembers.query(schema, handler)` for the office,
  `forManagers` (an owner or admin) for organization settings, `forEngineers` for the engineer
  portal, `forCustomers` for the customer portal (a customer's contact, see below), `forUsers` if
  it doesn't touch tenant data, `forAnyone` only for what's public on purpose
  (signing in, the theme, an invitation's link); an optional module uses its own set (see `modules.md`). The set runs its gate (`requireMember()` and friends) before the handler on every
  call, so the handler doesn't check again: it reads what the gate admitted with `currentTenant()`
  (`organizationId`, `roles`, `modules`, `user`), `currentUser()`, `await currentEngineer()` or
  `await currentCustomer()`.
- **Field engineers** (the role `engineer`) use the engineer portal (`(field)/my`, `forEngineers`, and
  a module's `moduleRemote(id, "engineer")`). `requireEngineer()` (the gate) finds the engineer
  record linked to their account once per request; `await currentEngineer()` answers it without
  its id. The orders they reach are the tenant's assigned to them, through the helpers in
  `src/lib/server/auth/engineer.ts`, which read the engineer's id themselves:
  `await engineerOrders()` for a query on `order` (a list, or a checklist or unit reached through
  its order), `await engineerOrder({ id } | { number })` for one, and
  `engineerOrderNotFound(ref)`, the one 404 ("Order ORD-… not found" when the request named a
  number); `findEngineerOrder(runner, ref, action?)` (`#lib/orders/server`) adds the orders' field
  rules. A record written with the engineer takes them from the order it reached
  (`order.engineerId`). Units and locations (the QR pages) are the tenant's for every engineer.
  `src/tests/unit/lib/server/auth/engineer-scope.spec.ts` keeps the engineer's id in that file.
- **Customers' contacts** (the role `customer`, `isCustomerContact()` in `#lib/auth/roles.ts`) are
  members linked to one of the tenant's customers (`portal_contact`), for all of its sites or some
  (`portal_contact_site`). They use the customer portal only: `requireMember()` refuses them (so
  every office set and module set does), and `handleGuard` (`hooks.server.ts`) sends them from any
  page their shell doesn't own (`shellOf(roles).owns(routeId)`, `#lib/auth/shells.ts`: the
  `(customer)` route group, by route id so a module's pages there count, and the QR codes' links)
  to its home, `/portal`, and everyone else away from it. `requireCustomer()` (the gate of `forCustomers`, and
  of `moduleRemote(id, "customer")`) finds their contact once per request; `currentCustomer()`
  answers it: `{ contactId, customer, siteIds }` (`siteIds` `null` for all sites). Every query of
  theirs is scoped to the tenant and the customer, and to the sites they see, with the helpers in
  `src/lib/server/auth/customer.ts`: `ofCustomer(access, table)` (a table with `customerId`),
  `atSites(access, siteColumn)` (no condition for all sites), `seesSite()`, and
  `customerOrders(access)` for `order` (an order is at a site through its units: a site-limited
  contact sees those with a unit at one of their sites, and of their units only those). The office
  invites them from the customer's page (`portal-access.remote.ts`: better-auth's invitation with
  the role `customer`; accepting it links the contact to the account, `/invite/[id]`), and they're
  not on the members page. A QR code (`/q/<token>`) leads them to "report a breakdown" when it's on
  their customer's unit or location at a site they see, and is a 404 otherwise
  (`resolveQrCode()`).
- Every select, update and delete on a tenant table (one with `organizationId`) includes
  `inTenant(table)` in its `where`, including lookups by id or code: ids are global and come from
  the client. Check that submitted references (e.g. a `customerId`) belong to the tenant, for a
  clear message (the foreign keys would refuse them anyway). Write the tenant scope with
  `idInTenant(table, id)` and `idsInTenant(table, ids)` (`session.ts`) instead of spelling out
  `and(eq(table.id, id), inTenant(table))`, a join to a tenant table with
  `.leftJoin(...tenantJoin(engineer, order.engineerId))`, and a join or correlated subquery whose
  rows share the outer row's tenant with `sameTenant(orderUnit, order)` instead of comparing their
  `organizationId`s: a bare `eq(table.id, id)` then stands out in review (`hand-written.spec.ts`
  refuses the spelled-out forms).
  `contract_equipment` has no `organization_id`: reach it through a tenant-checked
  contract or equipment.
- Inserts set `organizationId` from `currentTenant()`. Codes and numbers are unique and sequential
  per organization: pick the next one with `nextNumber(tx, "order")` (`src/lib/server/numbering.ts`;
  the formats are in `src/lib/numbering.ts`) and insert it in the same `db.transaction`
  (transactions take turns, see `src/lib/server/db/serialize.ts`, so concurrent creates can't pick
  the same one). A module numbers its own records with a format and table of its own:
  `nextNumber(tx, { format, table, column })`, e.g. `contractNumbers` in
  `src/modules/contracts/server/contracts.ts` and `invoiceNumbers` in
  `src/modules/invoices/server/invoices.ts`. An order is created only through
  `createOrders(tx, drafts)` (`src/lib/orders/server/creation.ts`, in `#lib/orders/server/index.ts`;
  a customer's report from the portal through `requestOrder()`, see "Orders awaiting acceptance"
  in `docs/agents/orders.md`),
  which checks each draft's customer, units and engineer, numbers, inserts it with its units
  (`units`, in their order; `setOrderUnits()` in `units.ts` saves an edited order's) and logs it: core's order
  form calls it (and saves its modules' parts with `beginOrderChange()`, see `docs/agents/orders.md`), and so
  do the modules (maintenance's "Create orders"). It doesn't emit `orders.committed`, which is for orders the
  client's pages already show.
- References between tenant tables are composite foreign keys that include the tenant, e.g.
  `(organization_id, customer_id)` → `customer (organization_id, id)`, and relations use the same
  column pairs, so the database refuses cross-tenant references and `with:` loads stay in the
  tenant. A new reference gets the same treatment; joins also add `inTenant()` for the joined
  table. Where a reference must belong to the same customer (an order's units, `order_unit`, a
  contract's coverage), the key pairs `customer_id` instead.

- Shared server helpers, so each section doesn't write them again: `bulkChange()` and
  `refreshRequested()` for bulk commands (`lists/bulk.ts`), the record toolkit (`records.ts`, see
  "One way" below) and `refuseOffParts()` for a form slot's parts (`forms.ts`).

## One way

Each recurring problem of server code has one way to solve it.
`src/tests/unit/lib/server/hand-written.spec.ts` refuses the hand-written forms, naming the file
and line.

**Refusing a change.** Services throw a `Refused` (`src/lib/server/refused.ts`) with what's
wrong: `throw new Refused(m.x())` for the whole change, `{ path: ["name"], message }` on a form's
field (nested paths too: `["lines", 2, "quantity"]`), or `Refused.check(problems)` for a check's
answers. The remote function doesn't catch it: `gated()` (`remote-functions.ts`) turns it into
the form's issues, each on its field, or for a command or query into a 400 with its messages; a
bulk action skips the record with them. A refusal that carries more for a caller that handles it
extends it (`StockShortage`, `OrderStockShortage`, an integration feed's `IngestRefused`). Services don't return
`{ problem }`/`{ problems }` unions, take the form's `issue`, or call `invalid()`; `invalid()` is
only for a remote form handler refusing its own field with `issue.x(...)`, which types the field.
A check that collects data for its caller (a hook's answer, `checkLines()`) may return problems,
which the caller throws.

**Remote files hold no transactions.** A `*.remote.ts` file is the gate and the refreshes: it
reads its input, calls a service in the section's `server/` (`saveContract()`,
`removeCustomer()`), and refreshes what changed. The files that still run a transaction are listed
in `hand-written.spec.ts`; move it out when you change one, and take it off the list.

**Records** (`src/lib/server/records.ts`):

- A record looked up by its page's key: `unitBySerial()` (`#lib/equipment/server/index.ts`),
  `customerByCode()` (`#lib/customers/server/index.ts`) and `orderByNumber()`
  (`#lib/orders/server/index.ts`), each a 404 with core's message, modules' cards too. Pass the
  fields (`unitBySerial(serial, { id: equipment.id, name: equipment.name }, tx)`), or a query that
  joins more:
  `unitBySerial(serial, (where) => db.select(…).from(equipment).innerJoin(…).where(where))`.
  `lookupBy()` makes another; `orNotFound(row, message)` is any other row (or a select's first)
  or a 404, and `byKey(rows, keyOf, notFound)` a batch query's finder.
- Deleting: `deleteAndLog(table, { subject, parent?, tx?, note?, referenced? })` deletes the
  tenant's record and logs it;
  `defineRemoval({ table, find, notFound, subject, blockers, referenced })` makes a section's
  `removeX(id)` (find or 404, refuse while `blockers` name something, delete and log, in one
  transaction), which its page and the list's bulk delete share.
- Ordered and named lists: `nextPosition(tx, table, scope?)` for a new record's place,
  `reorder(tx, table, id, direction, scope?)` for a move (the form is `moveSchema` in
  `#lib/schema.ts`; `moved()` in `#lib/ordering.ts` is the pure swap), and
  `nameTaken(tx, table, name, { scope, except })` for a name unique in any case.
