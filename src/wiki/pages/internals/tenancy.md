---
title: Tenancy
summary: Organizations own all business data, and every query, write and reference is scoped to one, so another tenant's records are not just hidden but not found.
section: internals
order: 1
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TenancySimulator from "#wiki/widgets/tenancy-simulator/tenancy-simulator.svelte";
</script>

Fieldworks serves many companies from one app and one database. Each company is an **organization**
(a tenant), and it owns its customers, units, engineers, orders, invoices and everything else you
see. Someone at one company cannot see, change or even find out about another company's records:
not through a list, a search, a link someone sends them, or an id typed into the address bar. A
record that belongs to someone else answers exactly as one that doesn't exist: a 404.

Two demo organizations show it. Signed in at North, you never see South's orders. And a person can
belong to more than one organization (an accountant, say) and switches between them; what they see
changes with the switch.

**Optional modules** are switched on per organization too. Switch invoices off for a tenant and its
pages, its remote functions and its entries in the log are not found for that tenant.

## Try it

The simulator below is one `order` table that two tenants share. Run a query as North or South, with
the tenant's scope or without, for every order or one by its id. Choose South's order while signed
in to North, and turn the scope off: the leak that every query's scope prevents.

<TenancySimulator />

<HowItWorks />

All tenant data is in tables with an `organization_id`, and four habits keep it apart.

**1. Every read and write is scoped.** A select, update or delete on a tenant table includes the
tenant condition, and lookups by id too, since ids are global and come from the client:
`inTenant(table)`, `idInTenant(table, id)`, `idsInTenant(table, ids)`. A join to a tenant table
goes through `tenantJoin()`, and a subquery whose rows share the outer row's tenant through
`sameTenant(a, b)`. A bare `eq(table.id, id)` stands out in review, and a guard spec
(`hand-written.spec.ts`) refuses the spelled-out forms. See <SourceLink path="src/lib/server/auth/session.ts" line={215}>inTenant</SourceLink> and <SourceLink path="src/lib/server/auth/session.ts" line={229}>idInTenant</SourceLink>.

**2. The gate decides who may call, the handler reads what it admitted.** Every remote function is
made with a [gated set](/wiki/internals/gates), and the handler reads the tenant with
`currentTenant()`. Inserts take `organizationId` from it, never from the client.

**3. The database refuses cross-tenant references.** A reference between tenant tables is a
composite foreign key that includes the tenant: `(organization_id, customer_id)` points at
`customer (organization_id, id)`. So even a bug that tried to attach South's customer to North's
order would be refused by the database. Tables are declared one way, with `tenantTable()` and
`tenantRef()`, and a spec (`tenant-tables.spec.ts`) refuses the hand-written form. See <SourceLink path="src/lib/server/db/columns.ts" line={89}>tenantTable</SourceLink>.

**4. Numbers are per tenant.** Order numbers, customer codes and the like are sequential within an
organization: `nextNumber(tx, "order")` picks the next one in the same transaction that inserts the
record, and transactions take turns, so concurrent creates can't pick the same one. Orders are made
only through `createOrders(tx, drafts)` and change status only through `transitionOrder()`.

**Roles inside a tenant** narrow it further. A field engineer reaches the orders assigned to them, a
customer's contact their own customer's records at the sites they see; their helpers
(`engineerOrders()`, `customerOrders()`) are in `src/lib/server/auth/`, and the
[access registry](/wiki/internals/permissions) reuses them as its rules.

**Tests.** Every section covers isolation: South can't see or change North's records, also by
tampering with ids. In e2e that is one page that is a 404 for the other tenant and one form
submitted with a tampered hidden id; the rest is in the section's server spec, which calls the
remote functions as South with North's ids. See [tests and guard specs](/wiki/internals/tests-and-guards).

<DocsPointer doc="docs/agents/tenancy.md" />
