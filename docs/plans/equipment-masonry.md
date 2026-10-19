# A masonry layout for the equipment detail page

Wish 4 of 19 October 2026, after grilling (Q10).

## Problem

`src/routes/(app)/equipment/[serial]/+page.svelte` lays out `PageHeader`, then `ServiceStats`
across the page, then a grid `lg:grid-cols-3`:

- **Left** (`lg:col-span-2`): only `<ServiceTimeline>`.
- **Right** (`flex flex-col gap-6`): Specifications, Owner, `SiteCard`, `QrCard`, the
  `equipment.detail.side` slot, and `ActivityCard`.

With every module on, the slot alone adds eight cards:

| Module      | Cards                 |
| ----------- | --------------------- |
| checklists  | inspections, template |
| condition   | condition, parts      |
| contracts   | coverage              |
| docks       | dock-usage            |
| maintenance | plans                 |
| materials   | parts                 |

The right column becomes very long, while the wide left column ends early and leaves empty space
under it.

## Decision (grilling)

Q10: **the equipment detail page only**. It reuses the dashboard's masonry, which moves to shared
code. Other detail pages can adopt it when they get crowded.

## Design

- **Move the masonry to shared code.** Move `src/routes/(app)/(dashboard)/masonry.ts` and its spec
  (`src/tests/unit/routes/(app)/(dashboard)/masonry.spec.ts`) to `src/lib/components/` (see
  `docs/agents/structure.md` for the exact folder). Then:
  - Reword its doc comment from "the dashboard's" to a general one.
  - Point the dashboard at the new path.
  - Move the grid's classes too if the dashboard's `cardGrid` is what makes it work (1 px rows in
    `data-masonry` mode), so both pages share them.
- **The equipment page:**
  - `PageHeader` and `ServiceStats` stay above.
  - Below them, one grid with `{@attach masonry}`: 1 column on small screens, 2 from `md`, 3 from
    `lg`.
  - Cards in this order: the timeline, marked `data-wide` (2 columns), then Specifications, Owner,
    Site, QR, every module card, and Activity.
  - The timeline comes first, as the masonry's comment asks of wide cards, so it starts at the top
    left. The narrow cards fill the third column and continue under the timeline once that column is
    longer.
  - DOM order stays the reading order.
- **Each module card is its own masonry item.** The dashboard does this already: the slot's wrapper
  is `display: contents` (see the comment above its `cardGrid`). Do the same here, and check that a
  failed contribution's card (`data-extension-failed`) is an item too.
- With 2 columns, the timeline spans both, so it's full width and the cards flow under it in two
  columns. With 1 column, it's a plain stack in DOM order.
- Cards keep their own height. Don't stretch any to line up the bottoms.

## Tests

- The masonry's unit spec, moved, still passes, as do the dashboard's e2e tests
  (`src/tests/e2e/dashboard.test.ts`).
- **e2e** for the equipment detail page with every module on, at a laptop width:
  - No two cards overlap.
  - The timeline spans two columns.
  - At least one card sits under the timeline: the columns are balanced, and the left column no
    longer ends far above the right.
  - At a phone width, the cards stack in DOM order.

## Out of scope

The customer and order detail pages, and changing what the cards show.
