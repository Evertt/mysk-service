---
title: Site report
summary: A printable maintenance report per site, for a period, with the units' condition, inspections, maintenance and faults, in the office and in the customer portal.
section: domains
order: 6
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A facility manager wants one document per building: how its units are doing, what was inspected
and maintained, which faults there were and how fast they were resolved. The **maintenance report**
of a site gives that for a period, on A4, ready to print or save as a PDF.

## What's in it

- **The header**: the site and its address, its customer, the period and when the report was made.
- **The summary**, by section: the units by condition on NEN 2767's scale and by status; the
  inspections done, valid, due, expired and rejected; the maintenance done, due and overdue; the
  faults reported and resolved, the average time to resolve one, and the orders completed; the
  energy its doors lost.
- **The units**, each with its condition score and its name, its last and next inspection, its last
  and next maintenance, and its faults in the period. A date in red is past due, in amber soon.
- **The faults and orders** of the period: made, scheduled or completed in it, newest first.

A section belongs to its module: without the condition module there's no condition, without
energy no energy, and the report works with every module off.

## Choosing the period and printing

The report covers this month so far, from its 1st to today. **From** and **To** choose another
period of up to a year; the choice is in the address (`?from=2026-01-01&to=2026-03-31`), so it can be
bookmarked or sent. **Print** prints the report alone, without the app around it.

It's reached from each site's card on [All sites](/wiki/domains/sites-overview) and from the site's
page: in the office under the customer's sites, in the customer portal under All sites. A contact
gets the reports of the sites they see only.

<TryIt as="customer" /> <TryIt as="planner" />

<HowItWorks />

**Built from the sites' figures.** The report asks the same extension point as the overview,
`customers.siteSummary`, for one site and the chosen period, with `units` on: each module then also
answers its columns of the units' table, a cell per unit (`UnitColumn`). The summary groups the
figures by their section, in the modules' places. Core adds its own section, the faults column and
the list of orders, and reads the units as the shell's audience sees them (`readUnits()`), so the
office and the portal share one component and one server function (`siteReport()`).

**The period** is the viewer's days (`periodOf()`): from the first day's start to the last day's
end in their time zone, refused when it ends before it starts or spans more than 366 days. Energy
counts the building's own days, as its own report does.

**Printing** puts the report on a `<PrintSheet>`, an A4 sheet with its own margins; the shells keep
their navigation off the paper, and the period's form and buttons hide in print.

- <SourceLink path="src/lib/customers/server/site-report.ts" line={91}><code>siteReport()</code></SourceLink>
- <SourceLink path="src/lib/customers/server/site-summary.ts" line={58}><code>periodOf()</code></SourceLink>
- <SourceLink path="src/modules/checklists/server/site-summary.ts" line={40}><code>checklistSiteSummary()</code></SourceLink>
- <SourceLink path="src/modules/maintenance/server/site-summary.ts" line={41}><code>maintenanceSiteSummary()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
