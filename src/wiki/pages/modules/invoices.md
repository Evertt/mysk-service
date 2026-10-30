---
title: Invoices
summary: Invoices and credit notes for completed orders and other modules' fees, with VAT, PDFs and receivables on the dashboard.
section: modules
order: 7
status: built
covers: [module:invoices]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Invoices turns completed work into bills. In the app the module is called **Invoicing**. It is the
module that others build on: the partner programme requires it, and contracts offer it their fees.

## What it adds

- **Invoices.** A draft invoice is made for a customer from what can be billed: their completed
  orders that are not invoiced yet, priced exactly as on their page (labour, the costs other modules
  add, and adjustments such as what a service contract includes), and fees other modules offer, such
  as a contract's monthly fee. You can add lines of your own, such as travel costs.
- **A status you can follow.** A draft is **issued**: it is dated today, can no longer be changed,
  and its orders become Invoiced. It is then **Sent**, becomes **Overdue** the day after its due date
  (computed, not stored), and is **Paid** when you record the payment. A draft or sent invoice can be
  **voided**: it keeps its number but bills nothing, and its orders go back to Completed so they can
  go on another invoice. Numbers are sequential per organization, such as `INV-2026-00001`, with no
  gaps.
- **Credit notes.** Credit part or all of an invoice: choose whole lines or part of a line. An issued
  credit note is taken off what the invoice leaves to pay, and once nothing is left the invoice is
  paid by its credit notes. A credit note that refunds money is settled once it is refunded.
- **PDFs.** Download an invoice or a credit note as a PDF.
- **Settings.** A manager sets the VAT rate (fixed on an invoice when it is issued), the default
  payment term, and the day from which other modules' fees are billed.

### Where it shows up

- On the orders list, select completed orders of one customer and choose **Create invoice**: a draft
  for that customer with those orders, which then opens.
- An order's page has an invoice card. The invoices list can mark several sent invoices paid at once.
- The dashboard shows what customers owe (sent invoices less their credit notes, including VAT) and
  the overdue invoices, most overdue first.

### Works with

Invoices require and enhance nothing. **Contracts** offer their monthly fees (see
[Contracts](/wiki/modules/contracts)), and the **partner programme** requires invoices for its
figures and pays a cash bonus as a credit note (see
[Partner programme](/wiki/modules/partner-programme)).

<TryIt as="planner" />

<HowItWorks />

The rules of an invoice live in one place, `invoice.ts`: numbering, the status, totals in cents (the
VAT is the subtotal times the rate, rounded half away from zero) and how an order becomes lines. An
order becomes a line at its price before adjustments, followed by a line per adjustment of the
tenant's modules, so the lines add up to the order's total from `priceOrders()`. The server applies
the rules in `server/`; credit notes share the invoice code in `documents.ts`, by `kind`.

What can be billed comes from two places. Completed orders are read from core. Other modules' fees
come through the collector `invoices.billableItems`, declared in `api/extensions.ts`, which is
`onError: "fail"`: if a module cannot answer, the request fails instead of making an invoice
without its fee. A thing is billed while it is on an invoice that is not void.

Two contributions leave the module: the bulk action `invoices:create-invoice` on the orders list
(`orders.list.bulk`, which only takes completed orders of a single customer, and checks on the
server whether one is on an invoice already), and the slots `orders.detail.side` and
`dashboard.cards`. The hook `orders.committed` makes an order that core has just saved refresh its
invoice card. For modules that require invoices there is an `api/` folder, for example
`revenue.server.ts` (the paid invoices' lines less the settled credit notes') and
`credit-notes.server.ts` (a standalone credit note), so they never read invoices' tables directly.

- <SourceLink path="src/modules/invoices/module.ts">module.ts</SourceLink>: the manifest, and
  <SourceLink path="src/modules/invoices">the module's folder</SourceLink>.
- <SourceLink path="src/modules/invoices/invoice.ts">invoice.ts</SourceLink>: numbers, status, totals,
  lines.
- <SourceLink path="src/modules/invoices/server/billable.ts">billable.ts</SourceLink>: what a customer
  can be billed for.
- <SourceLink path="src/modules/invoices/server/invoices.ts" line={271}>issueInvoice()</SourceLink>:
  issuing.
- <SourceLink path="src/modules/invoices/bulk-actions/orders.list.bulk.ts">orders.list.bulk.ts</SourceLink>:
  the bulk action.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
