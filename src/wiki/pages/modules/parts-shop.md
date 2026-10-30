---
title: Parts shop
summary: Partners order replacement parts in the customer portal and pay with their parts credit; the office confirms, ships and delivers.
section: modules
order: 11
status: built
covers: [module:parts-shop]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The parts shop is a catalogue in the customer portal where a partner orders replacement parts, for
example for sectional doors and levellers, and pays with the **parts credit** from their wallet.
Its sidebar entry sits after Materials.

## What it adds

- **Shop products.** A product is a material, offered in the shop: you give it a category and a
  description, say whether it is **payable with parts credit**, or **on request** (shown, but with
  the price on request and not to order in the shop), and which checklist points it fixes. Its
  price and stock are the material's. Only owners and admins change the shop's categories.
- **The shop in the portal.** A partner searches the catalogue by name or article number, filters by
  category, and builds a cart. The stock level shows as In stock, Low stock or On request.
- **Checkout with parts credit.** Only parts credit is accepted: no mixed payment, no invoice. The
  checkout shows the available balance, the order and the balance after. No VAT is charged on an
  order paid with parts credit. The order is refused when the credit or the stock is not enough, or
  when the company is not in the partner programme.
- **Shop orders.** The office sees the shop orders and moves each one through **Confirm**, **Ship**
  and **Mark delivered**. Placed, Confirmed, Shipped, Delivered or Cancelled. A shop order can be
  cancelled before it is shipped: the credit goes back into the partner's wallet (credit that has
  expired since stays expired) and the parts go back into stock.
- **Suggested parts.** When an inspection rejects a point, the order shows the **Part needed**: the
  products that fix that point, with an "Add to order" button. The customer sees the same
  suggestion in their portal, from the shop.

### Where it shows up

- The dashboard has a tile with the open shop orders.
- The office's bell rings when a customer places an order.
- The partner programme's wallet in the portal links to the shop.

### Works with

- **Materials** and the **partner programme** (requires): products are materials with their stock,
  and credit comes from the wallet. Switching either off switches the shop off. See
  [Materials](/wiki/modules/materials) and [Partner programme](/wiki/modules/partner-programme).
- **Checklists** (enhances): the suggestions for rejected points. See
  [Checklists](/wiki/modules/checklists).
- **Condition** (enhances): the points a product fixes are what a component with that product as its
  article is checked by. See [Condition](/wiki/modules/condition).

<TryIt as="customer" />

<HowItWorks />

Placing an order is one transaction, in `placeShopOrder()`: it spends the parts credit with the
partner programme's `spendCredit()` and sets the stock aside with the materials' `reserveStock()`,
both checked inside it, so the balance never goes below zero and the stock never runs out twice.
Cancelling does the reverse, `giveBackCredit()` and `releaseStock()`. The shop reads those modules'
tables only through their `api/` folders. Every change is logged against the customer.

The shop's pages in the portal are the manifest's `portal` entry and its routes in the `(customer)`
group (`/parts-shop/portal`). Its queries use the module's set for customers, whose handlers scope
everything with `currentCustomer()`, so a customer can only see their own orders.

Its extension contributions are small: `parts-shop.checkpoints` is a collector it declares in
`api/extensions.ts`, which checklists answer with the template points the products can be linked to;
the shop answers `condition.articleCheckpoints` (when condition is on) and `notifications.rules`
(the bell for an order a customer places). Its suggestion slots `checklists.order.rejected` and
`checklists.client.rejected` are checklists' points, filled from the shop's `slots/`.

- <SourceLink path="src/modules/parts-shop/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/parts-shop">the module's folder</SourceLink>.
- <SourceLink path="src/modules/parts-shop/server/orders.ts" line={89}>placeShopOrder()</SourceLink>:
  credit and stock in one transaction.
- <SourceLink path="src/modules/parts-shop/api/extensions.ts">api/extensions.ts</SourceLink>: the
  points it declares.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
