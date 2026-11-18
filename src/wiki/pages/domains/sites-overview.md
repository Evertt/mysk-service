---
title: All sites
summary: Every site of a customer in one view, live, worst first, as a head office follows them in the customer portal and the office sees them on the customer's page.
section: domains
order: 5
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A customer with many sites wants to follow all of them from its head office: where is a fault open,
is an engineer on the way, which units are critical. **All sites** shows a card per site, those
needing attention first, and changes the moment something happens there.

## What a site's card shows

Its name and address, how many units it has, whether it needs attention or is all fine, and chips
for what asks to be seen, each with its number:

- **Open faults**: reports not accepted yet, and breakdowns still to be done;
- **Engineer on the way** and **Scheduled today**;
- with the condition module, units that are **Critical** or need **Attention**;
- with checklists, inspections **expired** or **due** within 30 days;
- with energy, the energy its doors **lost today**.

A red or amber chip makes the site one needing attention, with a bar down the card's side. The
sites with the most red come first, then the most amber, then the rest by name. **Needing
attention** above the cards shows only those; the choice stays in the address, so back and a
reload keep it.

Tapping a card opens the site's page: its chips, its open work and its units. Each card and each
site's page links to the site's [maintenance report](/wiki/domains/site-report).

## Where it is

- **In the customer portal**, a row on Home, **All sites**, opens `/portal/sites`: one column, made
  for a phone. A contact sees their own customer's sites, and if the office invited them for some
  sites only, only those.
- **In the office**, **All sites, live** on the customer's page opens `/customers/<code>/sites`: the
  same cards, so a planner sees a customer's sites as its head office does.

Both pages stay live: a fault reported in the portal, an order planned, a unit's condition recorded
or an energy alert raised shows on the card without a reload.

In the demo, Ilse Brouwer is the head office of Distributiecentrum Zutphen, which has three sites:
at Zutphen a fault she reported waits to be accepted, an engineer is on the way to Deventer, and
Culemborg is all fine.

<TryIt as="headOffice" /> <TryIt as="planner" />

<HowItWorks />

**One collector, every module.** The figures come from one extension point,
`customers.siteSummary`: core asks it with the sites the viewer may read and a period, and each
module that's on answers its figures per site, with the record types they're read from. Core adds
its own (faults, on the way, scheduled today, work done) and sorts the sites
(`worstFirst()`). A module that's off adds nothing, and one that fails is left out.

**What the viewer may read.** Core picks the sites with the access registry (`visible("site")`), and
each module scopes its own reads the same way: the units (`visible("equipment")`), the orders, the
checklists, a unit's maintenance plans (a contact reads their own units'), the energy sites. So a
contact limited to some sites sees nothing of the others, and the energy alerts, which are the
office's, are not a contact's chip.

**Live.** Each page refreshes when its shell's feed tells a change of the types the figures are read
from (`refreshOnActivity()` with the answer's `watches`). The portal's feed watches every logged
type, and tells a contact only what they may read.

- <SourceLink path="src/lib/customers/extensions.ts" line={117}><code>siteSummary</code></SourceLink>
- <SourceLink path="src/lib/customers/server/site-summary.ts" line={253}><code>summarizeSites()</code></SourceLink>
  and <SourceLink path="src/lib/customers/server/site-summary.ts" line={289}><code>siteOverview()</code></SourceLink>
- <SourceLink path="src/lib/customers/sites/figures.ts" line={57}><code>worstFirst()</code></SourceLink>
- <SourceLink path="src/modules/condition/server/site-summary.ts" line={39}><code>conditionSiteSummary()</code></SourceLink>
- <SourceLink path="src/modules/energy/server/site-summary.ts" line={23}><code>energySiteSummary()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
