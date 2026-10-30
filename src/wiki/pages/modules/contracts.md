---
title: Contracts
summary: Service contracts that cover a customer's units with a guaranteed response time, make covered work free of charge and bill a monthly fee.
section: modules
order: 4
status: built
covers: [module:contracts]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

A service contract is a maintenance agreement: a customer pays a monthly fee, and in return their
units are covered with a guaranteed response time. In the app the module is called **Service
contracts**, with its own list at `/contracts`.

## What it adds

- **Contracts.** Each has a number, a customer, a **level** (Basic, Standard or Premium), a start and
  end date, a monthly fee, a response time in hours and the customer's units it covers. A contract
  is Upcoming, Active or Expired by its dates. The contract's page lists the covered units and the
  covered work done on them in the contract's period.
- **Free work.** An order is covered when its units were covered by a contract that was active on
  the day the order was created. What is included depends on the level:
  - Basic: nothing, only the guaranteed response time.
  - Standard: labour.
  - Premium: labour and materials.

  The included amount shows on the order as a discount line named after the contract, so the price
  the customer pays drops by exactly that. It covers servicing the units (breakdowns, repairs,
  maintenance, inspections), not new work on them, damage or other work.

- **Response times.** A covered breakdown or repair is a call-out, to be responded to within the
  contract's response time from when the order was created. It counts as responded to once it is
  scheduled. Until then it is on track, **SLA at risk** once less than a quarter of the time is
  left, and overdue after the deadline. The order carries the tag, in lists and on its page.
- **Monthly fees on invoices.** When the tenant has invoicing, each month of a customer's contracts
  is offered as a billable item, so the fee is billed with the customer's completed orders.

### Where it shows up

- The dashboard has two cards: the covered call-outs whose response time is at risk, most urgent
  first, and the contracts ending soon that are not renewed.
- An order's page and a unit's page each get a card saying whether a contract covers it, and which.

### Works with

- **Invoices** (enhances): contracts offer their monthly fees to invoicing. Without invoices they
  still cover work and watch response times. See [Invoices](/wiki/modules/invoices).
- **Materials** (enhances): only for the seed, so the demo's call-outs get material lines.
- **Maintenance** adds the plans of a contract's covered units to its page. See
  [Maintenance](/wiki/modules/maintenance).

Contracts require nothing.

<TryIt as="planner" />

<HowItWorks />

A contract never edits an order. Its `server/index.ts` makes four contributions: the access rule
for its records (`accessRules`), and three to core extension points:

- `orders.adjustPrices` returns a negative adjustment per covered order. Everything that shows or
  adds up an order's total prices it with `priceOrders()`, so the discount is the same in the order,
  the list, the invoice and the dashboard.
- `orders.tag` returns the SLA tag of an order whose response is at risk or overdue.
- `invoices.billableItems` returns a fee line per month of the customer's contracts in the invoice's
  period (it only takes part when invoicing is on).

The rules sit in one place, `coverage.ts`: which orders a contract covers, what a level includes
(`coveredAmount()`) and how a deadline's state follows from the response time (`responseDeadline()`).
The server applies them and the pages show them, so they cannot disagree. An order about several
units is covered only by a contract that covers every one of them, because an order's price and
response time cannot be split between contracts. The contract's page is a `RecordPage` with its own
slots (`contracts.detail.side`), declared with `defineRecordPoints("contracts", ...)`, which is how
maintenance adds its plans there without touching contracts' tables.

- <SourceLink path="src/modules/contracts/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/contracts">the module's folder</SourceLink>.
- <SourceLink path="src/modules/contracts/coverage.ts">coverage.ts</SourceLink>: coverage, price and
  response time, in one place.
- <SourceLink path="src/modules/contracts/server/index.ts" line={44}>server/index.ts</SourceLink>:
  the four contributions.
- <SourceLink path="src/modules/contracts/api/extensions.ts">api/extensions.ts</SourceLink>: the
  contract page's own slots.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
