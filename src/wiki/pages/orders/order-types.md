---
title: Order types
summary: The nine kinds of order, which are corrective work, and how a company renames or hides the ones it doesn't use.
section: orders
order: 2
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Every order has a **type**, which says what kind of work it is. There are nine, in the order the
order form offers them:

| Type             | What it is                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| **Breakdown**    | Something stopped working and the customer called us out.               |
| **Repair**       | Putting right what went wrong with a unit.                              |
| **Maintenance**  | Servicing a unit on its interval.                                       |
| **Inspection**   | Checking a unit against a norm.                                         |
| **Installation** | Putting a new unit in.                                                  |
| **Survey**       | A look at a site or a unit.                                             |
| **Damage**       | Work after an accident or a third party, not caused by the unit itself. |
| **Project**      | Project work.                                                           |
| **Other**        | Anything that fits none of the others.                                  |

A breakdown with priority **urgent** is what SHLTR calls a "storing prio". Priority (low, normal,
high, urgent) is a field of its own, not a type.

**Breakdowns and repairs are corrective work.** The app counts these when it works out how often a
unit needs repair, and when it checks a service contract's response time. Damage isn't corrective,
because the unit didn't cause it.

A customer who reports a breakdown in the portal always makes a `breakdown`; the urgency they pick
is the order's priority.

## Your own names, and the types you don't use

The set of types is fixed: the app's rules depend on it (contract coverage, response times,
checklists), so a company can't add one. It can do two things, under **Settings → Order types**
(owners and admins):

- Give a type **a name of its own**, per language. SHLTR might call _survey_ "Opname". A language
  left empty keeps the standard name. The new name shows everywhere the type shows: lists, filters,
  badges, the portals.
- **Hide** a type from the order form. Orders that already have it keep it, and it stays in the
  filters.

Two rules keep this safe. No two types may read the same in a language (whatever the case), so they
can still be told apart. And a type something needs stays offered: **breakdown** is always needed
(the customer portal makes them), and so is any type an enabled module works with. Maintenance plans
make _maintenance_ and _inspection_ orders, for example, so with that module on neither can be
hidden. The settings page says what needs each type.

<TryIt as="planner" />

<HowItWorks />

**The types are an enum** in `src/lib/models.ts` (`orderTypes`), shared by the schema, the seed and
the UI. A tenant's changes are rows in `order_type_setting`: the type, its names by locale (JSON)
and `hidden`. A type with nothing changed has no row, and saving it back to standard deletes the
row.

**The labels read the tenant's names.** `label("orderType", value)` asks `nameOrderTypes()`
(`src/lib/orders/types.ts`) for the tenant's name first and falls back to the standard label. On the
server the names come from the request's tenant, loaded once with it (`loadTenant()`). In the
browser each shell's layout awaits `getOrderTypes()` and hooks it up. The stored values, the
filters and the URLs keep the types' own ids.

**What the form offers** is `offeredOrderTypes(settings, current)`: the types not hidden, plus the
order's own type if it was hidden since.

**What may be hidden** is `requiredOrderTypes(enabled)` in `src/lib/orders/server/types.ts`:
breakdown, and every type in the `orderTypes` of an enabled module's manifest. `effectiveOrderTypes()`
ignores a hidden flag on a needed type, also if it was set before the module was switched on.

**Saving** is `saveOrderTypeSetting()` in the same file, a manager-only remote form
(`saveOrderType`). `orderTypeProblems()` finds what is wrong (a needed type hidden, a name already
taken), the transaction replaces or deletes the row, and the change is logged.

- <SourceLink path="src/lib/models.ts" line={36}>`orderTypes` and corrective work</SourceLink>
- <SourceLink path="src/lib/orders/types.ts" line={58}>`offeredOrderTypes()`</SourceLink> and
  <SourceLink path="src/lib/orders/types.ts" line={91}>`orderTypeProblems()`</SourceLink>
- <SourceLink path="src/lib/orders/server/types.ts" line={32}>`requiredOrderTypes()`</SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={102}>`order_type_setting`</SourceLink>

<DocsPointer doc="docs/agents/i18n.md" />
