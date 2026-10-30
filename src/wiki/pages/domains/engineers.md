---
title: Engineers
summary: The people who carry out orders, their specialty and rate, how an engineer's sign-in is linked to their record, and what they see.
section: domains
order: 3
status: built
covers: [domain:engineers]
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

An **engineer** is a person who carries out orders. Under **Engineers** in the office app you keep
them: a name, email and phone; a **specialty** (electrical, mechanical, HVAC, plumbing or
controls); a **region** (North, East, South, West or Central, or one of your own); an **hourly
rate**; when they were hired; and whether they're **active**.

An engineer's page shows their profile and their work: the orders they have open, soonest first,
the ones they completed last, and how many hours they booked and what that was worth in labour over
the last 30 days.

## Giving an order an engineer

Planning an order means choosing an engineer, a day and a time. The list of engineers puts those
whose specialty fits the order first: each unit's category says which specialty services it, so an
order on a unit whose category is serviced by HVAC puts the HVAC engineers at the top. You can still choose anyone who is
active. An inactive engineer can't be given new work, and an order that is awaiting acceptance or
already invoiced can't be assigned at all.

The hourly rate prices the labour of the orders they do: the hours an engineer logs times their
rate. An order with no engineer yet is estimated at a standard rate.

A customer sees only an engineer's **first name**, on their orders.

## Signing in as an engineer

An engineer's record is not a user account. To let an engineer use the engineer portal, an owner
or admin does two things: invites the person to the organization with the role `engineer` (under
**Settings → Members**), and then, on the engineer's edit page, **links** the engineer to that
account. The link is one-to-one: an account can be linked to one engineer in the organization, and
the page offers only members who aren't linked yet.

From then on the engineer lands in the engineer portal and sees only the orders assigned to them.

<TryIt as="engineer" />

## Deleting an engineer

An engineer who has orders assigned can't be deleted; the page says how many. Make them inactive
instead, and they keep their history but stop being offered for new work.

<HowItWorks />

**One table, with an optional account.** `engineer` has the profile columns and a nullable `userId`
referencing the user account. `engineer_user_organization` is unique, so a user is at most one
engineer per tenant. The rate is stored in cents. `order.engineerId` references the engineer with
a composite key that includes the tenant.

**Scoping to the engineer.** The engineer portal's remote functions are made with `forEngineers`.
Its gate, `requireEngineer()`, finds the engineer record linked to the account once per request,
and `await currentEngineer()` answers it. The orders an engineer reaches are the tenant's orders
assigned to them, through helpers that read the engineer's id themselves: `engineerOrders()` for a
query, `engineerOrder(ref)` for one, and `engineerOrderNotFound(ref)` for the one 404. A record
written by an engineer takes its engineer from the order it reached. A spec keeps the engineer's
id inside that file. Units and locations (the QR pages) are the tenant's for every engineer.

**Linking** is `linkEngineerAccount`, a `forManagers` form: it checks that the user is a member of
the tenant and isn't linked to another engineer, updates `userId`, and logs it with the accounts
by name.

**Removing** is `removeEngineer`, made by `defineRemoval()`: blockers are the orders assigned to
the engineer.

**Order of engineers** for an order is `fittingFirst(engineers, specialties)` in
`src/lib/engineers/display.ts`; the specialties are those of the order's units' categories, first
unit first.

- <SourceLink path="src/lib/server/db/schema/engineers.ts" line={9}>`engineer`</SourceLink>
- <SourceLink path="src/lib/engineers/form/account.remote.ts" line={49}>`linkEngineerAccount`</SourceLink>
- <SourceLink path="src/lib/engineers/display.ts" line={58}>`fittingFirst()`</SourceLink>
- <SourceLink path="src/lib/orders/server/pricing.ts" line={15}>`laborCost()`</SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
