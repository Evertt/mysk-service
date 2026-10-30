---
title: Partner programme
summary: A yearly bonus for accepted partner customers, from their paid revenue, paid as cash or as parts credit in a wallet.
section: modules
order: 10
status: built
covers: [module:partner-programme]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The partner programme rewards customers who buy a lot from you. A customer you accept as a
**partner** earns a level from the revenue they bring in during a year, and a bonus on it that is
paid after the year closes, either as a cash bonus or as a larger amount of parts credit. In the app
it is called **Partner programme**; for SHLTR it is the Partner Bonus and wallet.

## What it adds

- **Partners.** On a customer's page a manager chooses **Accept as partner**. The partner list shows each
  partner's revenue so far this year, their level and what is in their wallet.
- **Programme years.** A manager sets up each year: the **levels** (a name, the revenue threshold
  and the rates of the cash bonus and the parts credit) and, per revenue category, whether it
  counts for the level and for each form of bonus. The categories are fixed: maintenance contracts,
  service and maintenance, regular parts, regular orders, projects on regular terms, special project
  prices and tenders (net-net). A rule can say Yes, No or **By agreement**. A new year starts as a
  copy of the one before. The level is the highest whose threshold the partner's revenue reaches.
- **Classifying orders.** For categories that count "by agreement", the order form has a
  classification, saying how this order's revenue counts for the partner's level and bonus.
- **Closing a year.** After 31 December a manager closes the year. That freezes every partner's
  figures, level and bonus in both forms. The partner then chooses **cash** or **parts credit**,
  once, and for good. A manager can also make the choice in the office.
  - Credit goes into the partner's **wallet** as an award, valid until the end of a later year.
  - Cash is an amount to pay out, as a standalone credit note in the invoicing module, or outside
    the app.
- **The wallet.** A ledger of entries: Awarded, Spent, Given back, Expired and Adjustment. The
  office can add an entry by hand, for credit spent outside the shop or credit added. Credit past
  its date expires by itself, in the daily job.

### Where it shows up

- A partner sees their own level, bonus and wallet in the customer portal, and chooses their bonus
  there once the year is closed.
- A customer's page has a Partner bonus card, and the dashboard a card with the programme's year.

### Works with

- **Invoices** (requires): the partners' revenue is their **paid** invoices, less settled credit
  notes. Without invoices the programme is off. See [Invoices](/wiki/modules/invoices).
- The [Parts shop](/wiki/modules/parts-shop) requires the partner programme: it is where the credit
  is spent.

<TryIt as="planner" />

<HowItWorks />

The partner programme is the example for a module that **reads another module's data through its
`api/`**. It never reads invoices' tables: it asks `api/revenue.server.ts` for the paid invoices'
lines, less the settled credit notes', also as a subquery for its own server-side list, and pays a
cash bonus through `api/credit-notes.server.ts`, inside the programme's own transaction. It refers
to invoices' table with a foreign key, which is allowed because it requires the module.

The rules are pure functions in `model.ts`, shared by the tables, the seed, the server and the UI: a
partner's revenue sets its level, the part of it that qualifies, times the level's percentage, is
its bonus. Amounts are in cents and rates in basis points. When a year closes, the figures are
**frozen** (`partner_bonus_year`), so a later change to the rules does not rewrite history. The
wallet is a ledger whose balance is the sum of its entries; each entry keeps what is left of the
credit it brought in, so SQL can add up what is available on a given day.

It plugs in at `orders.saving` (the classification is saved with the order from the order form, as
`modules.partnerProgramme`: a hyphenated id's key is in camel case) and `jobs.daily` (expiring
credit), and the customer portal entry is the manifest's `portal`. It declares the
`partner-programme.client.wallet` slot, which the parts shop fills with a link to the shop.

- <SourceLink path="src/modules/partner-programme/module.ts">module.ts</SourceLink>: the manifest, and
  <SourceLink path="src/modules/partner-programme">the module's folder</SourceLink>.
- <SourceLink path="src/modules/partner-programme/model.ts" line={267}>levelFor()</SourceLink>: the
  level for a revenue.
- <SourceLink path="src/modules/partner-programme/server/close.ts" line={84}>closeYear()</SourceLink>:
  freezing a year.
- <SourceLink path="src/modules/partner-programme/server/wallet.ts">wallet.ts</SourceLink>: the
  ledger.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
