---
title: Maintenance
summary: Service each unit on a fixed interval, and turn the visits that are due into orders, by hand or every day.
section: modules
order: 8
status: built
covers: [module:maintenance]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Maintenance plans are the answer to "when is this unit due for service?". In the app the module is
called **Maintenance plans**; its sidebar entry sits after Equipment. A plan says that a unit gets a
visit every so many months, and the module turns each visit that comes due into an order.

## What it adds

- **Plans.** A plan belongs to a unit, and has a description, an **interval in months**, the day the
  next visit is due, an order type (**maintenance** or **inspection**) and a Paused switch. You add
  them on the unit's page, in a Maintenance card, or on a contract's page.
- **The due list** at `/maintenance`: the visits that are due, filterable by Overdue, "Overdue and the
  next 30 days" or "Overdue and the next 90 days". Select plans and choose **Create orders**: each
  plan gets an order for its unit, and its next visit moves on by one interval.
- **Orders by themselves.** A manager can switch on automatic orders in the module's settings. Every
  day, plans that are due get their orders, as with Create orders. A plan gets no new order while its
  last one is still open. **Days ahead** sets how early a plan counts as due (overdue plans always
  are), and **Email customers** sends the customer a note when an order is made for their unit.
- **Rhythm.** The next visit moves on from the previous due date, not from today, and keeps its day
  of the month, so a late visit does not shift the schedule.

### Where it shows up

- The equipment list gets a **next maintenance** column: the earliest due date of the unit's active
  plans, sortable, filterable by overdue, due within 30 days or no plan.
- The dashboard has a card with the visits that are due and the number overdue.
- A contract's page lists the plans of its covered units, and can give every covered unit without a
  plan this one, first due one interval from today.

### Works with

- **Contracts** (enhances): the plans of a contract's covered units on its page. See
  [Contracts](/wiki/modules/contracts).
- **Condition** (enhances): a unit's next visit shows as a "Next due" column in the Components
  list. See [Condition](/wiki/modules/condition).

Maintenance requires nothing, and works without either.

<TryIt as="planner" />

<HowItWorks />

Maintenance is the module to read for a **list of its own with a bulk action**: the due list
(`list/due-list.ts`, `server/list-sql.ts`) is a server-side list, and Create orders is its bulk
action. It is also the example of a **column in a core list** (`columns/equipment.list.columns.ts`,
with its SQL in `server/columns/`, contributed to the equipment list's `equipment.list.columns`
point), of **contributing to another module's slot** (`slots/contracts.detail.side/`,
which may import only contracts' `api/extensions.ts` and is given the covered units as props), and
of making records through a core service.

Both ways of turning a plan into an order go through `orderPlan()` in `server/orders.ts`, which
calls the core's `createOrders()`, so a plan's order is numbered, checked and logged exactly like any
other. The daily job, `runDueMaintenance`, contributed to `jobs.daily`, uses the shared
`dailyOrderRun()`: it runs as the system in each tenant that wants it, makes each plan's order in a
transaction of its own, counts failures, and sends the reminder emails afterwards, outside the
transactions. It is safe to repeat. The module declares `orderTypes: ["maintenance", "inspection"]`,
which a tenant cannot hide while it is on, and with condition on it contributes `condition.signals`
(the next visit, which the Components list shows).

- <SourceLink path="src/modules/maintenance/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/maintenance">the module's folder</SourceLink>.
- <SourceLink path="src/modules/maintenance/server/orders.ts" line={40}>orderPlan()</SourceLink>: a
  due plan becomes an order.
- <SourceLink path="src/modules/maintenance/server/automatic.ts">automatic.ts</SourceLink>: the daily
  job.
- <SourceLink path="src/modules/maintenance/columns/equipment.list.columns.ts">equipment.list.columns.ts</SourceLink>:
  the column.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
