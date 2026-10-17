# Parts shop and the partner programme in the portal: design notes

Phase 4b, not built yet. These are the findings and the design of the first attempt, which stopped
before writing code, so the next one can start from here. The brief: `shltr-domain.md` §2.1, §2.8,
§2.9, §3.5 and §4.2 (`parts-shop`, `partner-programme`).

## Already in place

- Materials seeds SHLTR's 14 parts (SD-001…LV-006) in `materials/server/seed/shltr.ts`: low ones
  have 2–6 in stock (the low threshold for pieces is 10), the ones on request 0.
- The portal's navigation seam (`portal: { route, label, icon }` in a module's manifest) and the
  `client.home` slot exist; `chooseBonus()` in `partner-programme/server/close.ts` is the seam for
  the customer's own cash-or-credit choice. The partner programme has no `api/` folder yet.
- SHLTR's demo contacts (`users.riedel`, `users.weggemans`) are both partners; a test of a contact
  who isn't one can delete that customer's `partner_account` row.

## Design

- **Dependencies**: `parts-shop` requires `materials` and `partner-programme`, and enhances
  `checklists`; checklists enhances `parts-shop` back (mutual enhancing, as checklists and
  condition do).
- **Checkpoint links**: `checklist_result` only copies a point's group and text, and a module can't
  read or reference the tables of a module it only enhances. So: a table
  `shop_product_checkpoint(organizationId, productId, templateItemId)` without a foreign key to
  checklists; a collector `parts-shop.checkpoints` in the shop's `api/extensions.ts` that
  checklists answers with its template points by id; and slots in checklists' `api/extensions.ts`
  on its office and portal order cards with props `{ number, rejected: { templateItemId, text,
unit }[] }`, the item id found by a subquery on the result's template, group and text.
- **Wallet**: a pure function in the partner programme's `model.ts` replays the ledger and says
  which credit (amount, valid until, bonus year) each spend took, oldest-expiring first. Cancelling
  a shop order writes one `reversal` per piece with that piece's date, so credit that has expired
  meanwhile comes back expired. A new `partner-programme/api/wallet.server.ts` offers
  `spendCredit(tx, holder, amount, note)` and the wallet summary; `addEntry` already refuses going
  below zero inside the transaction.
- **Stock**: a new materials movement kind `reservation` (negative) when a shop order is placed and
  `release` when it's cancelled; shipping and delivery move no stock. The kind is a text enum
  without a database check, so it needs labels (en, nl), no migration; through a new
  `materials/api/stock.server.ts`. The shop order's number goes in the movement's note (the
  order-number column would show it as a deleted service order).
- **Numbers**: `{ prefix: "SH-", digits: 3, yearly: true }` through `nextNumber`. The partner
  programme's seeded spend notes already say "SH-2026-007" and "SH-2026-011".
- **Routes**: portal pages in each module's `routes/(customer)/portal/…`
  (`/partner-programme/portal`, `/parts-shop/portal`); the shop's office list at `/parts-shop`.
- **VAT**: prices excl. VAT; Parts Credit pays the excl.-VAT total and no VAT is charged on a credit
  order (an open question for the client).
