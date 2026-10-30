---
title: Checklists
summary: A fixed checklist per unit on inspection and maintenance orders, filled in on the engineer portal, with the inspection status that follows.
section: modules
order: 2
status: built
covers: [module:checklists]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The checklists module gives every unit on an inspection or maintenance order a checklist: the
points an engineer checks, made from a template for the unit's equipment category. In the app the
module is called **Work orders** (the digital checkpoint work order); its sidebar entry sits right
after Equipment.

## What it adds

- **Templates.** A manager builds a template per norm: a name, the norm it inspects by (for example
  NEN-EN 12604/12453), how many months an inspection by it stays valid, the equipment categories it
  is for (a category has one template) and its points, in groups such as Mechanical and Safety.
  Retiring a template keeps it for the checklists already made with it.
- **The work orders page.** The module's main page lists the units whose category has a template,
  with a badge per year (open or done). Pick a unit to see this year's checklist and its history,
  or start the year's inspection or maintenance. Starting makes an order, a quote that is not yet
  planned, and the checklist comes with it. The office can also fill the checklist in for an
  engineer, such as a paper form brought back.
- **Filling in.** On an inspection or maintenance order, each unit has its own checklist. The
  engineer marks every point OK, Reject or N/A in the engineer portal, and each answer is saved as
  it is made. A rejected point needs a remark, saying what is wrong or which part it needs. A
  checklist is completed once every point is answered, with a general remark and advice for the
  customer.
- **Order rules.** An order cannot be completed while one of its checklists is open. Once a
  checklist is filled in, its unit cannot be taken off the order, the order cannot change to another
  type and cannot be deleted.
- **Inspection status.** From the latest completed checklist, a unit is **Valid**, **Expiring** (the
  last 30 days of its validity), **Expired**, **Rejected** or has **No inspection**. The status
  shows as a column in the equipment list, and on the unit's page, with the date it is valid until.
- **The work order on paper.** An order's checklists print as a work order, with the engineer's and
  the customer's signatures.

### Where it shows up

- The order's page, the unit's page and the engineer portal's order page carry the checklists.
- Customers see what the engineer found on each unit in their portal: on the order, on the unit, and
  as a printable work order.
- The office's bell rings when a checklist is completed with rejected points.

### Works with

- **Condition** (enhances): the inspection status becomes part of a unit's condition status, and a
  completed checklist gives the unit and its components their score. See
  [Condition](/wiki/modules/condition).
- **Parts shop** (enhances): a rejected point suggests the part that fixes it, with an "Add to
  order" button. See [Parts shop](/wiki/modules/parts-shop).

Checklists require nothing, and work without either.

<TryIt as="planner" />

<HowItWorks />

The manifest, `module.ts`, names the order types it works with (`orderTypes: ["inspection",
"maintenance"]`), the sidebar position (`nav: { after: "equipment" }`) and `enhances: ["condition",
"parts-shop"]`. The module plugs into core and into the modules it enhances at these points, all
contributed in `server/index.ts`:

- `orders.units` keeps a checklist per unit in step with the order's units and type: it creates
  drafts as units are added, and drops them only while nothing is answered.
- `orders.saving` refuses a completion while a checklist is open, and refuses a deletion, a type
  change or a unit removal once one is on record.
- `condition.signals` hands the condition module the inspection status, as SQL over `equipment`,
  and `condition.checkpoints` hands it the template points a component can be checked by. With the
  parts shop on, `parts-shop.checkpoints` links its products to the points.
- `notifications.rules` rings the bell for rejected points, and `access.rules` says who may read and
  change its records.

The module also declares points of its own for the modules that enhance it: the engineer portal's
`checklists.field.checklist` slot (condition shows its advice question there), the rejected-points
slots `checklists.order.rejected` and `checklists.client.rejected` (the parts shop's suggestions),
and the hook `checklists.completed` that condition answers by recording a condition. Its columns go
in the equipment list and in condition's units list.

The engineer and the office fill a checklist in through the same code: a `Filler` of kind
`engineer` or `office` (engineers only their own orders while in progress, the office any open
order). Every change is saved in a transaction. The inspection status is one function in
`model.ts` and the same rule in SQL for the list column, which binds no parameters because the
condition module repeats it many times in one statement.

- <SourceLink path="src/modules/checklists/module.ts">module.ts</SourceLink>: the manifest, and
  <SourceLink path="src/modules/checklists">the module's folder</SourceLink>.
- <SourceLink path="src/modules/checklists/server/checklists.ts" line={202}>syncChecklists()</SourceLink>:
  the checklists that follow an order's units.
- <SourceLink path="src/modules/checklists/server/field.ts" line={45}>Filler</SourceLink>: one set
  of rules for the engineer and the office.
- <SourceLink path="src/modules/checklists/model.ts" line={239}>inspectionStatus()</SourceLink>: valid,
  expiring, expired, rejected, none.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
