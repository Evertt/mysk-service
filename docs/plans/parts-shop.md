# Parts shop and the partner programme in the portal

Phase 4b, built. The brief: `shltr-domain.md` §2.1, §2.8, §2.9, §3.5 and §4.2 (`parts-shop`,
`partner-programme`). What follows is how it's built, and where it went another way than the first
design.

## The partner programme in the portal

- `/partner-programme/portal` (the manifest's `portal` entry, "Partner bonus"): this year's level,
  Partner Omzet, Bonus Omzet, the way to the next level and the expected cash and credit ("Nog niet
  besteedbaar · na jaarafsluiting"); the wallet with its entries; the last closed years; the tiers,
  "Omzet die meetelt", the year's cycle and the conditions, as messages. A customer that isn't a
  partner gets only that it isn't.
- The choice: a closed year with a bonus and no choice shows both forms; choosing asks first, saying
  it's once and for good, and goes through `chooseBonus()` (which refuses a second choice, also from
  another tab). In the demo Weggemans' last year waits for its contact's choice.
- `client.home` gets the bonus card and the wallet, like the mockup's dashboard. The wallet card has
  a slot, `partner-programme.client.wallet` (`api/extensions.ts`), where the shop puts "Besteed
  Parts Credit": the programme doesn't know the shop.
- `client/client-partner.remote.ts`, with `moduleRemote("partner-programme", "customer")`.

## The wallet

- `replayWallet()` in `model.ts` replays the ledger: what each spend took (`creditTaken()`, piece by
  piece, oldest-expiring first). A `reversal` names the credit it gives back to (its date and bonus
  year) and puts it back into that credit, so "awarded" stays as it was and credit that expired
  meanwhile comes back expired (the daily job expires it again). Only what goes beyond what was taken
  comes in as credit of its own.
- `api/wallet.server.ts`: `isPartner()`, `walletToday()`, `spendCredit(tx, holder, amount, note)` and
  `giveBackCredit(tx, holder, entryId, note)` (a reversal per piece), all through `addEntry()`, which
  refuses going below zero inside the transaction. `api/tables.server.ts` exports `walletEntry` for
  the shop order's key to its spend (a new unique index on `(organization_id, id)`).

## The parts shop

- **Dependencies**: requires `materials` and `partner-programme`, enhances `checklists`; checklists
  enhances the shop back.
- **Tables**: `shop_category` (the tenant's, managers set them up: the module's settings page),
  `shop_product` (one per material: category, description, unit set/piece/pair, popular, credit
  eligible, on request), `shop_product_checkpoint` (template point ids, no key), `shop_order`
  (`SH-YYYY-NNN`, status placed → confirmed → shipped → delivered, or cancelled before it's shipped;
  payment `parts_credit`; total excluding VAT, VAT zero; its spend's wallet entry) and
  `shop_order_line` (the material, SKU, name, quantity and price then).
- **Placing an order** (`server/orders.ts`, `placeShopOrder()`): one transaction checks the cart
  against the catalogue and the credit (`checkoutProblems()` in `model.ts`: empty, unknown, quantity,
  on request, not payable with credit, stock, balance), numbers it, spends the credit, inserts it and
  its lines and reserves the stock (`reserveStock()` in materials' `api/stock.server.ts`, movement
  kind `reservation`, the number in its note). Cancelling gives the credit back piece by piece and
  releases the stock (`release`). Shipping and delivery move no stock.
- **Pages**: the office's `/parts-shop` (open or all orders), `/parts-shop/orders/[number]` (the
  steps, history), `/parts-shop/products` (every material, put in the shop in a dialog with its
  checklist points) and `/parts-shop/settings`; the dashboard's stat of open orders. The portal's
  `/parts-shop/portal` (catalogue by category, search by name or SKU, stock badge from the materials'
  low threshold, "Parts Credit geschikt", points, the low-stock banner, cart, checkout with balance
  before and after) and `/parts-shop/portal/orders[/number]`.
- **The checklist link**: `parts-shop.checkpoints` (the shop's collector) is answered by checklists
  with its template points by id. A checklist result now carries `templateItemId` (a subquery on its
  checklist's template, group and text). Checklists' cards have slots with their rejected points:
  `checklists.order.rejected` in the office ("Benodigd onderdeel", "Add to order": a material line
  through materials' `api/lines.server.ts`, `addOrderLine()`, only on an order that can still change)
  and `checklists.client.rejected` in the portal ("Bestel in de shop", for a partner with credit,
  which opens the shop with the part in the cart, `?add=<product>`).
- **VAT**: excluding VAT; credit pays the excluding-VAT total and no VAT is charged
  (`creditOrderVat()`); the question is §5's 21.
- **Seed**: SHLTR only (`shltrOnly`). Its categories and fourteen products on its materials, linked to
  the template points they fix by text; Riedel's SH-…-007 (delivered, € 1.000) and SH-…-011
  (confirmed, € 475) are the partner programme's seeded spends (`orderSpends` in its draft: the shop
  sets their amounts and notes) and add reservations to the materials' draft (`movements`), which
  its ledger takes into the opening balance, so the stock stays as it was.

## Left out

- A shop order can't be paid partly on invoice; non-credit products can't be ordered.
- A material in a shop order can't be deleted (the order's line refers to it).
- The cash bonus is still paid outside the app (no credit notes).
