---
title: Schedule
summary: The planning board that says who does which order, and when, by week, month and day.
section: modules
order: 12
status: built
covers: [module:schedule]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The schedule is where a planner turns open orders into a plan. Its sidebar entry sits right after
Orders.

## What it adds

- **The week board.** A grid of engineers by days, with the week's orders as cards. Next to it is the
  **backlog**: the open orders without a date, the most urgent first (by priority, then by age). On
  a narrow screen the board is a list per day instead of a grid.
- **Planning by drag and drop.** Drag a card from the backlog onto an engineer's day, or from one
  cell to another to move it. The card moves at once, and goes back with a message if the change is
  refused. A planned order gets the time 09:00 unless you choose another.
- **Planning with a dialog.** Every card also has **Schedule...**, a dialog with an engineer, a date
  and a time, which shows the problems of the order at its fields. On a narrow screen, where cards
  cannot be dragged, it is the way to plan.
- **Month and day views.** Switch the view between Week, Month and Day. The month is a calendar
  with each day's orders, colour-coded by order type with a legend, and a "+n more" link for a full
  day. The day view lists who does what, and when.
- **Over-booked.** An engineer with more than three orders in a day is marked as over-booked.
- **Live.** When someone else plans an order, an engineer completes one or an order comes in, an
  open board refreshes by itself.

Cancelled orders do not show on the board. Planning an order is the **plan** action of the order's
lifecycle: a quote that gets an engineer becomes Scheduled, and an order in another open status
keeps its status. Whatever scheduling triggers elsewhere, such as materials stock being set aside,
happens here too.

### Works with

Schedule requires and enhances nothing, and no other module depends on it.

<TryIt as="planner" />

<HowItWorks />

The schedule is the one module **without tables of its own**: it is a view of the orders, and
changes them only through a core service. It owns its route, its components and its messages, and
nothing else: no `server/` folder, no hooks and no slots.

The board's data comes from two queries in `schedule.remote.ts`. `getSchedule` returns the engineers,
the orders scheduled in the Monday-to-Sunday week and the backlog; `getScheduleMonth` returns the
six weeks of a month, which the server sets so no request loads more. Each order is joined to its
customer and its first unit (with how many units it has), and the specialties that service its
units, so the dialog can list the matching engineers first. Both are scoped to the tenant like any
other query.

Planning goes through `transitionOrder()` with the verb `plan`, in a transaction: that is the one
place that changes an order's status, so it refuses an order that is not open, a problem with the engineer, or
a stock shortage, the same as the order form does. The dialog (`scheduleOrder`) is a form; the drag
and drop (`moveOrder`) is a command. After either, the board's query is refreshed. `watchSchedule`
is a live query over the record types the board shows (`order`, `engineer`, `customer`), which sends a
timestamp on each change so an open page re-reads. Drag and drop is the client's own: it applies the
move optimistically and undoes it on an error (`board-drag.svelte.ts`).

- <SourceLink path="src/modules/schedule/module.ts">module.ts</SourceLink>: the manifest, and
  <SourceLink path="src/modules/schedule">the module's folder</SourceLink>.
- <SourceLink path="src/modules/schedule/schedule.remote.ts" line={103}>getSchedule()</SourceLink> and
  <SourceLink path="src/modules/schedule/schedule.remote.ts" line={162}>moveOrder()</SourceLink>: the
  data and the change.
- <SourceLink path="src/modules/schedule/board/board-drag.svelte.ts">board-drag.svelte.ts</SourceLink>:
  drag and drop.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
