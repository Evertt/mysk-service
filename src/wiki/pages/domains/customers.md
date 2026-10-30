---
title: Customers
summary: The companies work is done for, their sites, and how they connect to units and orders; and who from a customer may use the portal.
section: domains
order: 1
status: built
covers: [domain:customers]
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import RecordsDiagram from "#wiki/widgets/records/records-diagram.svelte";
</script>

A **customer** is a company that owns equipment and orders work. Under **Customers** in the office
app you keep them: a code (`CUST-0001`, numbered by the app), a name, a contact person with email
and phone, a city and country, and a segment (enterprise, mid-market or small business).

A customer's page shows its key figures (open orders, revenue, how many units need attention, the
year it became a customer), its contact, its sites, its units, and what changed lately.

## Sites

A company rarely has one address. A customer has one or more **sites**, such as "Ede" or
"Hoofdvestiging", and the work is done at a site. For each site you keep:

- the address, and a contact for the site if it isn't the customer's;
- how the site likes to be contacted (email, phone, WhatsApp, portal);
- the day and the hours that visits suit it;
- a priority, and **access notes**: "Melden bij receptie expeditie noord."

The engineer sees these on the order, so they know whom to ask for and how to get in. A customer
always keeps at least one site, because its units have to be somewhere.

## How the records connect

<RecordsDiagram />

Read an arrow as "has": a customer has sites, units and orders. A site has locations (named places
such as "Dock 03") and units. A unit is at one site and may be at one of that site's locations.
An order is for a customer, is about some of that customer's units (none for a survey or a new
installation), and may have an engineer. The customer's units, the order's units and the unit's
site are always the same customer's: the database refuses a mix.

## Portal access

A customer's contacts can use the customer portal. From the customer's page, under **Portal
access**, an owner or admin invites a contact by email, for all of the customer's sites or for
some of them. The contact accepts the invitation, gets an account, and from then on sees only that
customer's orders, units and sites. Revoking access removes them. Everyone in the office can see
who has access; only owners and admins can change it.

<TryIt as="planner" />

## Deleting a customer

A customer can be deleted only while it has no units and no orders; the page says how many it has
instead. A site can be deleted only while it has no units, and never the customer's last one. A
module that keeps records at a site (the docks' dock positions, an energy site) can refuse too, and
says what to remove first.

<HowItWorks />

**Four tables.** `customer`, `customer_site` and (for the portal) `portal_contact` and
`portal_contact_site`. Every one has an `organizationId`, and references between them are composite
foreign keys that include the tenant, so a row can't point into another tenant. Where a record must
belong to the same customer (a unit's site, an order's units, a contact's sites) the key pairs
`customer_id` too. The diagram above is drawn from those keys.

**Codes.** A customer's code is picked by `nextNumber(tx, "customer")` in the same transaction that
inserts it, so concurrent creates can't pick the same one. It's unique within a tenant; another
tenant may use the same code.

**Removing is a definition, not a function.** `removeCustomer` is made by `defineRemoval()`: it
finds the customer in the tenant or answers 404, asks the `blockers` (units and orders), deletes it
and logs it, in one transaction. The customer's page and the list's bulk delete share it. Sites do
the same in `removeSite()`, where the modules vote through the `removingSite` extension point.

**Portal contacts** are members with the role `customer`, linked to a `portal_contact`. Every query
of theirs is scoped to the tenant, their customer and their sites (`ofCustomer()`, `atSites()`,
`customerOrders()`), and the access registry decides the rest. See
[Roles and shells](/wiki/start/roles-and-shells).

**What a site shows** depends on who reads it. The office, and an engineer at the sites of their orders, see the
contact preferences and access notes (the `onSite` columns); a customer's contact sees only the address.

- <SourceLink path="src/lib/server/db/schema/customers.ts" line={8}><code>customer</code></SourceLink> and <SourceLink path="src/lib/server/db/schema/customers.ts" line={35} symbol="customerSite"><code>customer_site</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/portal.ts" line={16} symbol="portalContact"><code>portal_contact</code></SourceLink>
- <SourceLink path="src/lib/customers/server/customers.ts" line={13}><code>removeCustomer</code></SourceLink>
- <SourceLink path="src/lib/customers/detail/portal-access.remote.ts" line={119}><code>invitePortalContact</code></SourceLink>
- <SourceLink path="src/wiki/widgets/records/records-diagram.svelte">the diagram</SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
