---
title: Dashboard
summary: The office's home page, with the day's numbers, the next scheduled work, three charts and what has just happened.
section: across
order: 5
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A planner lands on the dashboard after signing in. It opens with a greeting for the time of day
and a row of tiles:

- **Open orders**: quotes, scheduled and in-progress orders, how many have no engineer yet, and
  how many orders were made in the last seven days against the seven before.
- **Awaiting acceptance**: orders customers reported in their portal. The tile is a link to the
  orders list, filtered to those.
- **Urgent**: open orders with the priority "urgent".
- **Revenue**: the completed work of the last thirty days, priced like everywhere else, against the
  thirty days before.
- **Equipment needing attention**: units that need service or are out of service, of all units.

Below the tiles are cards: the next six scheduled orders with customer, units, engineer and
priority, a chart of units by status, revenue per month, orders made per week by status, and the
latest activity. The cards are packed in columns, so the page is one column on a phone, two on a
laptop and three on a wide screen.

Switch a module on and the dashboard grows with it. Materials adds a low-stock tile, condition and
energy their own tiles, the parts shop its open orders; contracts, invoices, maintenance and the
partner programme each add a card. A tenant without a module never sees its tile.

The numbers are live: when anyone in the organization changes something, the tiles, charts and
recent activity ask again ([live updates](/wiki/across/live-updates)). Engineers and customers have
their own home pages and never see this one.

<TryIt as="planner" />

<HowItWorks />

The page asks for its data in two queries, `getDashboard` (the tiles and the upcoming orders) and
`getCharts`, both gated by `forMembers`, and every select in them is scoped with `inTenant()`. Revenue is not a SQL sum: each completed order is priced
with `priceOrders()`, because the modules adjust prices. See <SourceLink path="src/routes/(app)/(dashboard)/dashboard.remote.ts" line={25}>getDashboard</SourceLink>.

Modules reach the page through two slots in <SourceLink path="src/lib/dashboard/extensions.ts" line={9}>dashboard.stats</SourceLink> (a
`StatTile` each) and <SourceLink path="src/lib/dashboard/extensions.ts" line={17}>dashboard.cards</SourceLink>.
A module puts a component in `slots/dashboard.stats/` or `slots/dashboard.cards/`, and it loads its
own data with the module's remote functions. Each contribution renders in its own error boundary,
so a failing card shows a notice and the rest of the page carries on. A card that needs room says
`data-wide` on its root and spans two columns where there are two.

The tiles use `<StatTile>` and its trend (`compare()` in `stat-trend.ts`), which decides whether a
change is good news, bad news or neither: more orders made is neither, more revenue is good. The
grids are shared with the page's loading skeleton (`dashboard-grids.ts`), so the outline shows the
same columns before the data arrives.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
