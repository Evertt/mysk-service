---
title: The work record
summary: What was done on an order's site, read in one place and shown to each audience only what it may see.
section: orders
order: 4
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

When the work is done, the order keeps a **work record** of it:

- the **units** the work was on, in the order they were worked, with each one's category and where
  it is (its site and location);
- the **notes** the engineer wrote on the way ("gate code changed", "needs a new motor next time");
- the **sign-off**: who signed for the customer, the engineer's own signature, and when.

Four screens show it, and none shows quite the same thing:

- **The office's order page** shows the notes, and who in the office collected the sign-off. The
  engineer is named in full. The units come with the sites' contact and access details, and the
  warranty date.
- **The engineer's order** shows the notes, but not who collected the sign-off. The engineer isn't
  shown: it's them. The units come with the sites' contact and access details, on their own order.
- **The customer's order** shows no notes and no collector. The engineer is named by first name.
  The units come with the sites' address only.
- **The printed work order** shows no notes and no collector, and names the engineer in full. Its
  units are as the customer sees them.

So a customer never reads an engineer's notes, an engineer doesn't see who in the office collected
the sign-off, and only the office sees a unit's warranty date. The printed work order (the
**werkbon**) is handed to the customer, so it's written as the customer's view, with the engineer
named in full.

The units are shown the same way in every shell: a row per unit with its category and location,
linked to its page in that shell, naming its site when the order's units are at more than one.

<TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**One reader.** `readWorkRecord(scope)` in `src/lib/orders/server/work-record.ts` reads it, and
`readWorkRecords()` reads several orders in as many statements as one (the order's page and its
hover card share it). The readers don't write their own selects of units, notes or sign-offs:
they are the office's order page (`getOrder`), the engineer portal's (`getMyOrder`), the customer
portal's (`getPortalOrder`) and the checklists module's printed work order (`loadWorkOrder`). Each
reads its own header beside it, on the scope's `where`.

**Who sees what is one table.** `audiences` in the same file is the only place that says it:
`office`, `engineer`, `customer` and `workOrder`, each with `notes`, `collectedBy`, `engineer` and
`units`. A key the table says no to isn't in `WorkRecord<A>`'s _type_. A customer's record has no
`notes` property at all, so a page can't render it by mistake. A new column a portal mustn't see
becomes a key in the table, not a select of a page's own.

**A scope picks the order and names the audience.** Only these make one, each async, and they ask
the access registry for the order's condition (`visibleOrNone("order", …)`), so a page, a list and
`mayRead()` agree:

- `await officeOrder(number)`: the tenant's order;
- `await engineerWork(ref)`: the engineer's own;
- `await customerWork(access, number)`: the customer's, with only the units at the contact's sites;
- `await printedWorkOrder(number, viewer)`: the office's any; a contact's, done orders only.

An order the scope doesn't reach reads as `undefined`, and the caller answers a 404 with its own
message.

**The sites** are the units' distinct sites; for an order without units, the customer's site when
it has just one, else none. The units are read as their audience sees them, by `readUnits()`
(`src/lib/equipment/server/units.ts`); see [Equipment](/wiki/domains/equipment).

**Showing it** has components for every shell: `<WorkUnits>`, `<SignOff>` and `<NotesList>`
(`#lib/orders/components.ts`).

- <SourceLink path="src/lib/orders/server/work-record.ts" line={62}><code>audiences</code></SourceLink>
- <SourceLink path="src/lib/orders/server/work-record.ts" line={211}><code>readWorkRecord()</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={118} symbol="orderNote"><code>order_note</code></SourceLink> and <SourceLink path="src/lib/server/db/schema/orders.ts" line={139} symbol="orderSignoff"><code>order_signoff</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="The work record" />
