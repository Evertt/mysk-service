---
title: What Fieldworks is
summary: A field-service app for planning, doing and billing work at customers' sites.
section: start
order: 1
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
</script>

Fieldworks is a field-service app: the office plans orders for customers' sites, engineers carry
them out, and customers follow along in their own portal.

A company that installs, services and inspects equipment at its customers' sites (doors, docks,
stairs, air conditioning) keeps all of it here: who the customers are, what is installed where,
what work was ordered, who did it, and what it cost.

## The people in it

Three kinds of people use it, each in a shell of their own:

- **The office** (planners, owners, admins) works in the office app. They keep the customers, sites
  and units, create and plan orders, watch the dashboard and the activity log, and switch the
  optional modules on and off.
- **Engineers** work in the engineer portal, built for a phone. They see the orders planned for
  them, start a job, log hours and notes, and complete it with the customer's signature.
- **Customers** work in the customer portal. They report a breakdown, follow their orders and see
  their own units and sites.

The page [Roles and shells](/wiki/start/roles-and-shells) shows what each of them can do, and
[Try the demo](/wiki/start/try-the-demo) lets you sign in as each.

## The records

Everything hangs on a few records:

- A **customer** has **sites**, and a site has **units** (the equipment), at named **locations**.
  See [Customers](/wiki/domains/customers) and [Equipment](/wiki/domains/equipment).
- An **order** is work for a customer, usually on one or more of their units. It moves through a
  fixed [lifecycle](/wiki/orders/lifecycle), from quote to invoiced.
- An **engineer** carries out orders. See [Engineers](/wiki/domains/engineers).

## What else is in the box

- **Several companies, one app.** Each company is an organization (a tenant) and sees only its own
  data. Nobody can reach another's records by guessing an id.
- **Optional modules.** Service contracts, invoicing, maintenance plans, schedule, materials, work
  orders with checklists, and a few more can be switched on per organization. An organization
  without a module doesn't see it.
- **English and Dutch**, and a choice of looks (themes) in light and dark.
- **Live pages.** When a colleague changes an order, your page shows it without a reload.
- **QR codes** on units and places lead an engineer to the unit, and a customer to "report a
  breakdown" for it.

<HowItWorks />

Fieldworks is a SvelteKit app (Svelte 5, remote functions) on SQLite with Drizzle: libsql on
Node, a Durable Object on Cloudflare. Sign-in is better-auth, text is Paraglide (English and
Dutch), and the tooling is Vite+ and pnpm.

The code is split by who owns it:

- The four **core domains** (orders, customers, equipment, engineers) are in `src/lib/<domain>/`,
  by feature: `ui/`, `list/`, `form/`, `detail/`, `server/`.
- Each **optional module** is everything of it in `src/modules/<id>/`. Core never imports a module;
  a module adds to the core through extension points.
- The three **shells** are route groups: `(app)` for the office, `(field)/my` for the engineers and
  `(customer)/portal` for customers. `src/lib/auth/shells.ts` is where each starts and which
  pages are its own.
- Organizations own all business data. Every query on a tenant table is scoped to the signed-in
  organization, and every change is logged in the activity log.

<DocsPointer doc="docs/agents/structure.md" section="Where files go" />

Source: <SourceLink path="src/lib/auth/shells.ts" line={28} symbol="shells">the shells</SourceLink>, <SourceLink path="src/lib/modules/manifests.ts">the module manifests</SourceLink>.
