---
title: Modules overview
summary: The eleven optional modules, how a tenant switches them on and off, and what depends on what.
section: modules
order: 1
status: built
covers: []
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import ModuleMap from "#wiki/widgets/module-map/module-map.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Fieldworks has a core: orders, customers, equipment and engineers, with the office, the engineer
portal and the customer portal around them. Everything else is a **module**, a feature a tenant can
switch on or off. A tenant that never plans maintenance has no maintenance pages, no maintenance
columns and no maintenance jobs. SHLTR, the demo tenant, has all eleven on.

## The map

Switch a module off below and see what goes with it. Modules drawn with a line to another one
**require** it: they cannot work without it, so they go off together.

<ModuleMap />

## The eleven

| Module                                               | Called in the app | What it is for                                                   |
| ---------------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| [Checklists](/wiki/modules/checklists)               | Work orders       | A checklist per unit on inspection and maintenance orders.       |
| [Condition](/wiki/modules/condition)                 | Components        | Each unit's and component's condition over time, and its status. |
| [Contracts](/wiki/modules/contracts)                 | Service contracts | Covered work is free; response times are watched.                |
| [Docks](/wiki/modules/docks)                         | Docks             | Live dock state from Salvo hardware, and doors left open.        |
| [Energy](/wiki/modules/energy)                       | Energy            | Power and consumption per zone, thresholds, alerts.              |
| [Invoices](/wiki/modules/invoices)                   | Invoicing         | Invoices and credit notes for completed orders and fees.         |
| [Maintenance](/wiki/modules/maintenance)             | Maintenance plans | Visits on a fixed interval, turned into orders.                  |
| [Materials](/wiki/modules/materials)                 | Materials         | Parts and consumables, their prices and stock.                   |
| [Partner programme](/wiki/modules/partner-programme) | Partner programme | A yearly bonus for partners, as cash or parts credit.            |
| [Parts shop](/wiki/modules/parts-shop)               | Parts shop        | Partners order parts in the portal and pay with parts credit.    |
| [Schedule](/wiki/modules/schedule)                   | Schedule          | Who does which order, and when: week, month and day.             |

## Switching modules

A manager (an owner or an admin) switches modules on the **Settings** page, under Modules. Each
module has an Enable or Disable button, a short description and the date it was enabled. The page
does what the graph says:

- Enabling a module also enables what it **requires**. The dialog says so: "Also switches on ...".
- Disabling a module also disables what **requires** it: "Also switches off ..., which need it."
- A change that would leave a module without what it requires is refused, naming the modules.

Switching a module off hides it. It does not delete anything: its tables and records stay, so
switching it on again brings everything back. Meanwhile its pages and data answer as not found, its
sidebar entry, dashboard cards, columns and bulk actions are gone, its daily jobs do not run, and its
records are not found in the activity log or the feeds. Two modules, docks and energy, even stop a
customer's site from being deleted while they have records there, and tell you to switch them on
first.

## Requires and enhances

A module's manifest can say two things about other modules.

- **requires**: it cannot work without it. The partner programme requires invoices (its figures are
  the partners' paid invoices). The parts shop requires materials (its products are materials, with
  their stock) and the partner programme (it is paid for with the partners' credit).
- **enhances**: it does more when the other is on, and works fine without it. Checklists enhance
  condition and the parts shop: with condition on, a unit's inspection status goes into its
  condition, and with the parts shop on, a rejected point suggests the part that fixes it.

Only `requires` decides what is on. If you switch off a module that another one only enhances, the
other keeps working and simply stops showing the extra.

<TryIt as="planner" />

<HowItWorks />

Each module is a folder, `src/modules/<id>/`, that is self-contained: its manifest `module.ts`, a
`server/` folder with its tables, seed and hooks, its `routes/` (a page there is served under the
module's own URL, `/<id>`), components, messages in English and Dutch, and tests. A generator
(`scripts/modules.ts`) reads the folders and writes the registries the app uses: the module list
and graph, hooks, slots, columns, form parts, seeds and the route stubs. The manifest's `requires`
and `enhances` are read from the source text, so the graph cannot drift from the code.

A tenant's modules are rows in `organization_module`. When a request loads the tenant,
`effectiveModules()` turns those rows into what is really on: it adds the always-on modules, then
drops every module whose requirements are not all on, until nothing changes. `enhances` plays no
part. The settings form, `setModules`, asks `changeModules()` first and refuses what would break a
requirement, so the rows stay consistent.

Core never imports a module. A module reaches core pages through **extension points** (slots,
columns, bulk actions, hooks and others), and each one only takes part for tenants that have the
module. Every module's remote functions are made with `moduleRemote("<id>")`, which answers a 404
for a tenant without it.

- <SourceLink path="src/lib/modules/graph.ts" line={28}>effectiveModules()</SourceLink> and <SourceLink path="src/lib/modules/graph.ts" line={99}>changeModules()</SourceLink>: what is on,
  and what a change may do.
- <SourceLink path="src/lib/modules/define.ts" line={16}>defineModule()</SourceLink>: the manifest.
- <SourceLink path="src/lib/server/auth/session.ts" line={259}>requireModule()</SourceLink>: the
  gate behind a module's pages and data.
- <SourceLink path="scripts/modules.ts">scripts/modules.ts</SourceLink>: the generator.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
