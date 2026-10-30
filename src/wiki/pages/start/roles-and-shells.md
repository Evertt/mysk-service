---
title: Roles and shells
summary: Who uses Fieldworks, the three shells they work in, and what each role can do there.
section: start
order: 2
status: built
covers: [shell:office, shell:engineer, shell:customer]
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import RoleSwitcher from "#wiki/widgets/role-switcher/role-switcher.svelte";
</script>

Fieldworks has one app but three **shells**: the office app, the engineer portal and the customer
portal. A person works in one of them, chosen by their role in the organization. Each shell has
its own pages, its own menu and its own limits on what it shows.

<RoleSwitcher />

## The office app

For the people who run the company: planners, and the owners and admins who also manage the
organization. It starts at `/`, the dashboard, and has the whole company in it:

- **Orders**: the list, the order page, the form. Create an order, give it a status, plan it
  (an engineer, a day, a time), and accept or reject the breakdowns customers report. A badge on
  Orders counts the reports still waiting.
- **Customers, Equipment and Engineers**: the records, with their sites, units and locations.
- **Activity**: the log of who changed what.
- **Modules**: what the organization has switched on, such as Schedule or Invoicing, each with its
  own entry in the menu.
- **Settings**, for owners and admins only: members, invitations, order types, equipment
  categories, which modules are on.

Roles in the office: `owner` and `admin` (the managers) and `member`. A member does everything
above except the settings.

## The engineer portal

For field engineers, on a phone. It starts at `/my`: the orders planned for the engineer, by day,
and the recent ones. An order opens to what the engineer needs on site: the job, the units, the
site and its access notes, the customer's contact with call and email buttons.

There the engineer starts the job, logs the hours, adds notes, and completes it: the customer
signs on the screen, and so does the engineer. Scanning a unit's or a place's QR code opens it in
this portal, with the engineer's open orders for it.

An engineer sees only the orders assigned to them. The role is `engineer`, and the account is
linked to an engineer's record by an owner or admin, on the engineer's page.

## The customer portal

For the customer's own contacts. It starts at `/portal`: a button to report a breakdown, the
customer's open orders (also those not accepted yet) and their latest finished work. Besides that,
their orders, units, sites and locations.

A contact sees only their own customer's records, and, if the office invited them for some sites
only, only those sites'. They don't see the engineers' notes; of an engineer they see the first
name. The role is `customer`; an owner or admin invites a contact from the customer's page,
under Portal access.

## And a fourth place: /ops

Developers have a small area at `/ops` for reading the bug reports people record. It isn't a
tenant's shell and isn't in `shells.ts`; only the emails listed in `DEVELOPER_EMAILS` get in.

<HowItWorks />

One file knows the shells: `src/lib/auth/shells.ts`. Each shell has a `name`, a `home` (where its
members start, and where the guard sends them back to from a page that isn't theirs) and
`owns(routeId)` (which pages are theirs, by SvelteKit's route id, so a module's pages in the same
route group count).

| Shell      | `home`    | Owns                                                                     |
| ---------- | --------- | ------------------------------------------------------------------------ |
| `office`   | `/`       | every route but the customer portal (an office member may look at `/my`) |
| `engineer` | `/my`     | the `(field)` route group, and the QR codes' links `/q/[token]`          |
| `customer` | `/portal` | the `(customer)` route group, and the QR codes' links                    |

**Which shell a member gets** is `shellOf(roles)`, from their roles in the current organization:
a member whose only team role is `engineer` gets the engineer portal, one whose only role is
`customer` gets the customer portal, anyone else the office. Someone with an office role as well as
`engineer` works in the office.

**The guard** is `handleGuard` in `hooks.server.ts`. On every page request of a signed-in user it
asks `shellOf(roles).owns(routeId)` and redirects to the shell's `home` if the page isn't theirs.
Signed out, the visitor goes to the login page and back. `/wiki` is public and left alone.

The guard only decides which page you may open. What you may read is decided again on the server,
by the gate every remote function is made with (`forMembers`, `forEngineers`, `forCustomers`, …)
and by the access registry, so a customer who guesses an order number of another customer gets a
404 whichever page they ask from.

The demo accounts are the same split: Jan is a member (office), Lev is an engineer, Marieke a
customer's contact.

- <SourceLink path="src/lib/auth/shells.ts" line={28}>`shells` and `shellOf()`</SourceLink>
- <SourceLink path="src/lib/auth/roles.ts">the roles</SourceLink>, with `isFieldEngineer()` and
  `isCustomerContact()`
- <SourceLink path="src/hooks.server.ts" line={145}>`handleGuard`</SourceLink>
- <SourceLink path="src/wiki/widgets/role-switcher/roles.ts">the cards above</SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
