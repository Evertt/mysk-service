---
title: The service report
summary: The signed work order a customer keeps of a finished job. It prints today; a PDF that is mailed and stored is planned.
section: orders
order: 5
status: partly built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

When a job is done, the customer expects something they can keep: what was done, by whom, and
both signatures. In the Dutch trade it is the **werkbon**; here it is the **work order**, and it
doubles as the service report. The printed work order exists. Rendering it to a PDF, keeping the PDF and mailing it to the
customer is only a plan.

## What exists

For an order with checklists (filled in or not), the order's page has a **Work order** button. It opens the
work order laid out for A4, without the app's menu, with a **Print** button that uses the browser's
print dialog (or saves a PDF from it). It holds:

- the order: its number, type, status, date and engineer;
- the customer, and the site where the work was;
- the units, each with its checklist: every point with its outcome, grouped, and the remarks;
- the signatures of the engineer and the customer, with the names.

The office and the customer's contacts can both open it. A contact sees the version written for
them: only the units at their sites, no engineer's notes, and for the office's part of a checklist
only that the office completed it. A contact can open the work order of a finished order only.

It belongs to the **Work orders** module (`checklists`), because the checklists are what most of
the page is. Without that module an order has its sign-off on its page, but no printable work
order.

<TryIt as="planner" /> <TryIt as="customer" />

## What is planned

The plan for the PDF (linked below) is
to produce the PDF when an order is completed, so the customer doesn't have to print anything:
render the same work order to a PDF, store it, mail it to the customer's contact, and show it in
both portals. Because the PDF is a record of what was signed, it wouldn't change when the order is
edited later. The plan has not been decided, and has open questions about who receives it and how
it is sent.

<HowItWorks />

**The data is the work record.** The work order is built from the order's work record (see
[The work record](/wiki/orders/work-record)): `loadWorkOrder(number, viewer)` in the checklists
module takes the scope from `printedWorkOrder(number, viewer)` (the office's any order; a contact's
their done orders, with only the units at their sites), reads the record with `readWorkRecord()`,
the order and its customer beside it, and every checklist of the units shown. That one function
serves two pages, so the office's and the customer's versions come from the same rules.

**The page** is `detail/work-order.svelte`, wrapped in `PrintSheet` with the page's print styles.
It is the one place the layout is decided. The office reaches it at
`/checklists/work-orders/[number]`, and the customer portal has its own route in the same module.
Both are linked from the checklists' card in a slot on the order's page. In the office
(`orders.detail.side`) the card shows when the order has checklists, filled in or not. In the
portal (`client.order`) it shows the completed ones, and has the button once the order is done.

**What the plan would change.** It moves the work order out of the checklists module into core,
with checklists filling a slot, so every order has one. The PDF would be rendered by Cloudflare's
Browser Rendering after the completion's transaction, never inside it, stored in R2, and mailed
with `sendMail()`. Until then, print it from the browser.

- <SourceLink path="src/modules/checklists/server/work-order.ts" line={22}><code>loadWorkOrder()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/work-record.ts" line={116}><code>printedWorkOrder()</code></SourceLink>
- <SourceLink path="src/modules/checklists/detail/work-order.svelte">the printed page</SourceLink>
- <SourceLink path="docs/plans/service-report-pdf.md">the plan for the PDF</SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="The work record" />
