# Maintenance plans module (design, October 2026)

A new optional module, `src/modules/maintenance/`: service each unit of equipment on a fixed
interval, and turn what is due into orders. It is the first module built from scratch rather than
moved out of core. The module system still lacks several parts, and this module needs them, so it is
also a test of the system:

- a module's column in a core list
- a core service a module uses to create records
- a slot owned by another module
- the module's own server-side list with a bulk action
- a sidebar entry placed after a core entry

## 1. What tenants get

Boiler, chiller and generator service is mostly recurring work: every unit gets a visit every N
months, often because a contract promises it. Today the office tracks that outside the app and
types each order by hand. With the module:

- **A unit has maintenance plans.** Each plan has:
  - a description, which becomes the order's description, e.g. "Annual boiler service"
  - an order type, `maintenance` or `inspection`
  - an interval in whole months, 1–60
  - the date the next visit is due
  - whether it's paused

  A unit can have several plans, e.g. a quarterly filter change and a yearly inspection.

- **The due list** at `/maintenance` shows the active plans that are due:
  - Columns: unit, customer, plan, interval, next due (badged when overdue), last order.
  - Default range: overdue plus the next 30 days. Other choices: overdue only, the next 90 days, or every plan.
  - Search, sorting and paging run on the server, like the orders list.
- **"Create orders"** is a bulk action on the due list. It makes one order per selected plan: the unit's customer, the unit, the plan's type and description, normal priority, and the status and fields a new order gets from core's own form without a date. Scheduling stays with the schedule module or the order page.

  Each plan then moves forward one interval from its previous due date, not from today, so a late visit doesn't shift the rhythm, and remembers the order as its last one. Deleting that order later doesn't move the plan back; the office can edit the due date.

- **On a unit's page**: a "Maintenance" card in `equipment.detail.side` lists the unit's plans and lets you add, edit, pause and delete them in a dialog.
- **On the equipment list**: a "Next maintenance" column, the earliest due date of the unit's active plans. It can be sorted, and filtered by overdue, due within 30 days, or no plan. This is the module-column work, see §3.
- **On the dashboard**: a card in `dashboard.cards` with the number of plans overdue and due this month, linking to the due list with that range.
- **On a contract's page** (contracts module, if on): a card listing the plans of the units the contract covers. Its action, "Add a plan to each covered unit without one", takes a description, a type and an interval.
- **Sidebar**: `nav: { after: "equipment" }`.

Every office member (`moduleRemote("maintenance")`) can do all of this. The engineer portal gets
nothing in this version.

**Not in this version:**

- creating orders automatically on a schedule (the app has no background jobs, and the bulk action keeps the office in control)
- intervals by running hours
- checklists
- templates per equipment category
- reminders to customers
- planning the created orders

## 2. Data

- **`maintenance_plan`**:
  - `id`
  - `organization_id`
  - `equipment_id`, a composite foreign key to `equipment (organization_id, id)`
  - `order_type`, the `maintenance` | `inspection` subset of `orderTypes`
  - `description`
  - `interval_months`
  - `next_due_on`, a timestamp at the start of the day
  - `paused`
  - `last_order_id`, nullable, a composite foreign key to `order (organization_id, id)`, set null when the order is deleted
  - `created_at`

  Index on `(organization_id, next_due_on)`. Migration: `pnpm db:generate --name add-maintenance`.

- **The module only writes its own table.** Orders come from a new core service (§3).
- **Activity**:
  - The subject is `maintenancePlan`, labelled `<serial number> · <description>`, linking to the unit's page.
  - Creating, editing, pausing and deleting a plan log `created`, `updated` and `deleted`.
  - Creating orders logs each order's `created` (core's service does that) and the plan's `updated` (`next_due_on`, `last_order_id`).
- **Seed**: North has the module, with plans for about a third of its boilers, chillers and generators, a few overdue. South doesn't have it, so the e2e tests have a tenant without it. The demo data of core, contracts and invoicing must not change: draw from the shared faker only after the other modules, or use the module's own faker with a fixed seed, and check the dump against main.
- **Tenants**: the module is new, so no existing organization gets it by migration. New organizations get it through `org:create --modules`.
- **Switching it off** keeps the plans. Switching it back on shows them as they were.

## 3. What the module system gains

1. **A core service for creating orders**: `createOrders(tx, drafts)` in `#lib/orders/server/`, exported from `#lib/orders/server/index.ts`. It:
   - checks each draft's customer and unit belong to the tenant, and that the unit belongs to the customer
   - picks numbers with `nextNumber`
   - inserts the orders and logs `created`
   - does whatever core does after an order is created (`orderCommitted()` after commit)

   It returns the new orders' ids and numbers. Core's own create in `order.remote.ts` goes through it too, so there is one way to create an order. Keep the change to core's form path small: another branch (the materials module) also changes that code.

2. **Module columns in a core list.** The design was deferred until a module needs one (`docs/plans/README.md`): "module columns are namespaced (`contracts.covered`) and merged into a list's definition and SQL per tenant". Requirements:
   - **Declaring the point:** core declares it in `#lib/equipment/extensions.ts`, e.g. `defineListColumns<…>("equipment.list")`. The module contributes by file, like slots and bulk actions (e.g. `columns/equipment.list.ts`), and the generator checks the point and its owner.
   - **The definition:** a contribution brings its list-definition part (id `maintenance.nextDue`, label, sort, filter kind), its SQL for `ListSql` (a correlated subquery or a join of its own, tenant-scoped), and its cell.
   - **Merging:** the merged definition and SQL are per tenant: a tenant without the module gets neither the column nor its URL parameters. The URL stays lenient and drops unknown parameters; the remote query stays strict for the tenant's own columns.
   - **Types:** core's own columns keep their exact types; the module's are typed at the contribution.
   - **Tests:** `columns.spec.ts`-style checks cover the merge. Specs use the made-up modules of `#lib/modules/fakes.ts`.
   - **Scope:** keep it to what this column needs (sort and a `oneOf` filter, no grouping), but general enough that a second list could declare a point the same way.
3. **A slot owned by a module**: contracts declares `contracts.detail.side` in its `api/extensions.ts` and renders it on the contract's page, with props `{ number: string; equipmentIds: number[] }`. Maintenance says `enhances: ["contracts"]`, so it may import that file only, and contributes `slots/contracts.detail.side/plans.svelte`. This exercises the generator's owner check for a module-owned point, and the rule that an enhancing module gets what it needs through props, not through the other module's tables.
4. **A module's own server-side list**: `defineList()`, `ListSql` and `planList()` used from inside a module for the due list, with a bulk action on its own table (`idsTarget` or `listTarget`).

If the module-column design grows well beyond this column's needs, build the smallest general
version, and write down what's left in the plan under "Not there yet".

## 4. Translations

- Module label: en "Maintenance plans", nl "Onderhoudsplannen".
- Description: en "Service each unit on a fixed interval, and turn what's due into orders." nl "Onderhoud elk apparaat op een vast interval en maak opdrachten van wat eraan komt."
- Message section `maintenance` (`maintenance_*` keys).
- Terms: maintenance plan → onderhoudsplan, interval → interval, due → gepland, overdue → te laat, paused → gepauzeerd, next maintenance → volgend onderhoud.

## 5. Tests

- **Unit specs in `src/modules/maintenance/tests/unit/`** (mirroring the module), and core's in `src/tests/unit/`:
  - advancing a due date by months, including the end of the month: 31 January + 1 month = 28/29 February, and the next step comes from the plan's original day
  - the due-range filters
  - the plan schema
  - the column merge
  - `createOrders`' checks
- **e2e in `src/modules/maintenance/tests/e2e/`**, in the usual shape:
  - North: add a plan on a unit, see it in the due list, create orders in bulk. The orders get the right customer, unit, type and description, and the plans advance with their last order set. Also: activity entries, the dashboard card's counts, sorting and filtering the equipment list's column, and the contract card's bulk add.
  - South: `/maintenance` is a 404, there's no sidebar entry, no card on units, contracts or the dashboard, no column, its URL parameter is ignored, and the remote functions are refused.
  - Tenant isolation: tampering with another tenant's plan or unit ids is refused.
  - Switching the module off and on keeps the plans.
- **Core's tests stay green.** Order creation through `createOrders` gets a spec, and the orders e2e still pass.
