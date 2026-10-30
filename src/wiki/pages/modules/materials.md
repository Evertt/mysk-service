---
title: Materials
summary: Parts and consumables with prices and stock, and what orders use of them.
section: modules
order: 9
status: built
covers: [module:materials]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Materials is the catalogue of parts and consumables, with a price and a stock level each, and the
link between them and the orders that use them. Its sidebar entry sits after Engineers.

## What it adds

- **A catalogue.** Each material has an article number (SKU), a name, a unit (pieces, metres,
  kilograms or litres), a list price per unit and its stock. Changing a price does not touch
  existing orders, which keep the price they were quoted. A material used on an order cannot be
  deleted.
- **A stock ledger.** Stock is never edited, it moves. Every change is an entry: the opening
  balance, **Received**, a **count adjustment** (you enter what you counted and the difference is
  recorded), **Used on order**, **Returned from order**, and with the parts shop **Reserved for a
  shop order** and **Released from a shop order**. A material's page shows the history,
  newest first, and which orders use it. A level shows as **In stock**, **Low** (below 10 pieces, or
  50 metres, kilograms or litres) or **Out of stock**.
- **Materials on orders.** The order form gets a materials part: lines of a material and a quantity.
  The materials are a **cost** in the order's price, so the order's total, the invoice and the
  dashboard include them. The quantity must fit the material's unit.
- **Stock follows the status.** An order holds its materials' stock **from Scheduled on**: Scheduled,
  In progress, Completed and Invoiced. A quote, an order awaiting acceptance and a cancelled order
  hold none. Scheduling takes the stock, cancelling gives it back, and deleting the order gives back
  what it took. When there is not enough, the change is refused with a message such as "Only 3 pcs
  of ... in stock", at the line in the form.
- **In the field.** On the engineer portal's order page, the engineer records the materials they
  used. They come out of stock.

### Where it shows up

- The dashboard has a Low stock tile.
- A unit's page lists the parts used on its completed orders.

### Works with

Materials require nothing. **Condition** is enhanced by it: a material is the article of a
component. See [Condition](/wiki/modules/condition). The [Parts shop](/wiki/modules/parts-shop)
requires materials, since its products are materials.

<TryIt as="planner" />

<HowItWorks />

Materials was core before it became a module, which makes it the example for a module whose tables
core used to own: order lines and the stock ledger. It plugs into the order at three points, all in
`server/index.ts`:

- `orders.costs`: the order's materials as a cost in its price.
- `orders.saving`: the order's lines and the stock that follows its status are saved with it, in the
  order's transaction. A shortage throws a `Refused` that the form shows on its fields.
- `condition.articles`: the materials as components' articles (when condition is on).

Its part of the order form is typed and validated by a valibot schema (`form-parts/orders.form.ts`)
that the generator collects into the form's `modules.materials` field, so SvelteKit validates it on
the server and the browser. The engineer portal saves lines through the same code
(`server/lines.ts`), so both do it the same way. The stock ledger's only writer is `moveStock()`,
and `moveOrderStock()` takes or returns what an order's lines and status say it should hold: the
difference between what the ledger says it holds and what it should hold now. That is why an order
whose status changed while the tenant had materials switched off is put right the next time it is
saved. For modules that require materials (the parts shop), `api/stock.server.ts` offers
`reserveStock()` and `releaseStock()` to set stock aside inside the caller's transaction.

- <SourceLink path="src/modules/materials/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/materials">the module's folder</SourceLink>.
- <SourceLink path="src/modules/materials/model.ts" line={63}>holdsStock()</SourceLink>: which statuses
  hold stock.
- <SourceLink path="src/modules/materials/server/stock.ts" line={179}>moveOrderStock()</SourceLink>:
  the ledger follows the order.
- <SourceLink path="src/modules/materials/form-parts/orders.form.ts">orders.form.ts</SourceLink>: the
  form's part.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
