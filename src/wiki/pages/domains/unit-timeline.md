---
title: A unit's timeline
summary: "What happens with a door, in one list on its page in every shell, with today's figures above it: openings, reports, orders, conditions and inspections."
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

"What's happening with this door?" A unit's page answers it in one place. At the top, today's
figures: how often the door opened today and the energy lost through it (with the energy module),
and its condition on NEN 2767's scale, such as "3 · Redelijk" (with the condition module). Under
them, everything that happened to it, newest first, grouped by day ("Today", "Yesterday", then the
date), with the time on the left:

| Time  | What happened                      |
| ----- | ---------------------------------- |
| 14:30 | Order completed, with 2 photos     |
| 11:05 | Order created, engineer scheduled  |
| 10:40 | Fault reported via the QR code     |
| 08:12 | 14 min open — energy loss measured |

## What it tells

- **Reports and orders**: a fault reported, and how (through the QR code on the unit, or in the
  customer portal); an order created; a report accepted, or not (with the reason); the engineer
  scheduled, on the way, at work; the order completed, with its photos as thumbnails; an order
  cancelled. Each links to the order's page in the shell.
- **Photos and documents** added to the unit's orders and to the unit.
- **The door's openings** (energy): an opening as long as the door's threshold or longer on its
  own line, "14 min open — energy loss measured"; the shorter ones counted per hour, "12× opened ·
  0.4 kWh lost", so a busy door doesn't flood the list. The office also sees the alerts.
- **Conditions measured** (condition): "Condition measured: 3 · Redelijk, 2 defects", with the
  status it brings ("Needs attention, was OK") and the defects' photos.
- **Inspections completed** (checklists), with their outcome.
- Its installation, and, for the office, the end of its warranty.

**Load more** reads the next part. The page follows the changes: a report, a planned engineer or a
condition shows up without reloading.

## Who sees what

- **The office** sees it all, with who did what by name, on the unit's page (where it took the
  place of the service history's own timeline; the figures of its service stay above it).
- **An engineer** sees it on the unit in the engineer portal: the orders that are theirs, people by
  their first name. Conditions, and a door's openings with today's figures, show on a unit of
  their own orders, as everywhere in the portal; the energy alerts stay the office's.
- **A customer's contact** sees it on the unit's page in the customer portal, under the report
  button and the links, on their phone: their own units at the sites they see. Never the planner's
  name nor the reporter's, the engineer by their first name only, no alerts, no warranty and never
  a defect's photos.

<TryIt as="planner" /> <TryIt as="customer" />

<HowItWorks />

**One collector, two points.** The timeline is the extension point `equipment.timeline`, a `skip`
collector in `src/lib/equipment/extensions.ts`: given the unit, the viewer and where the page
starts (a cursor: the moment and id of the last entry shown), each module answers its entries,
newest first, at most a page of them, and whether it has older ones. The core adds its own from the
activity log. `equipment.figures` is today's figures, from the start of the user's day until now.
An entry is `{ id, at, kind, title, detail?, order?, photos?, tone, icon }`, its text made on the
server in the request's language, for the viewer.

**Pages.** `pageOf()` merges the answers in timeline order (newest first, then by id). A source that
has older entries than it answered holds the page back to its last one, so none of its entries is
skipped; the next page asks for the entries after the last one shown. The energy module reads its
doors' events in windows ending on whole hours, so an hour's count is always whole.

**Access.** Every source asks the access registry for its own records: the core reads the orders
the viewer may read (`visibleOrNone("order")`), energy the doors (`energy_door`) and the alerts
(`energy_alert`, the office's), condition the conditions (`unitCondition`) and their photos
(`conditionPhoto`, which has no rule for customers), checklists the checklists. The unit itself is
`readOrNotFound()`'s: another customer's unit, a unit at a site the contact doesn't see, another
tenant's or a tampered serial number is a 404.

**How a report came in** is `order_request.via` (`qr` or `portal`). The QR code's destination for a
customer's contact carries `?via=qr`, which the unit's page passes to the report form.

**The demo.** SHLTR's Sectionaaldeur D-07 at Riedel has the day above: its door opens for 14
minutes at 08:12, Riedel's contact reports a fault through the QR code at 10:40, the planner
accepts it and plans an engineer at 11:05, who completes it at 14:30 with two photos. That day is
today once 14:30 is past, else yesterday.

- <SourceLink path="src/lib/equipment/extensions.ts" line={51}><code>timeline</code></SourceLink> and <SourceLink path="src/lib/equipment/extensions.ts" line={67}><code>figures</code></SourceLink>
- <SourceLink path="src/lib/equipment/timeline/timeline.ts" line={121}><code>pageOf()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/timeline.ts" line={80}><code>coreEntries()</code></SourceLink> and <SourceLink path="src/lib/equipment/server/timeline.ts" line={441}><code>unitTimeline()</code></SourceLink>
- <SourceLink path="src/modules/energy/server/timeline.ts" line={67}><code>openingEntries()</code></SourceLink>
- <SourceLink path="src/modules/condition/server/timeline.ts" line={47}><code>conditionTimeline()</code></SourceLink>
- <SourceLink path="src/lib/server/db/seed/unit-story.ts" line={89}><code>seedUnitStory()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
