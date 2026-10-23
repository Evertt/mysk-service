# One look for the whole app: the UI consistency plan

Review of 23 October 2026, of every page of `develop` (e5d7b392) as the shltr planner, engineer and
customer, in the Lagoon theme, at 1440 px and 390 px. The per-area findings, with file references,
are in [`docs/reviews/ui-consistency/`](../reviews/ui-consistency/):
[code-system](../reviews/ui-consistency/code-system.md) (the system and its primitives, from the
code), [shell](../reviews/ui-consistency/shell.md) (shell, dashboard, settings, error pages, the
theme), [lists](../reviews/ui-consistency/lists.md),
[details-forms](../reviews/ui-consistency/details-forms.md),
[modules](../reviews/ui-consistency/modules.md) and [portals](../reviews/ui-consistency/portals.md).
How Lagoon copies the mockup is in [shltr-style.md](shltr-style.md).

## The diagnosis in short

The foundation is good and mostly consistent: `PageHeader`, `ListLayout`/`ListToolbar`,
`RecordPage`, `RecordForm`, `EnumBadge`, and Lagoon's calm base (grey page, white hairline cards,
muted inputs, tinted square status badges). About 50 pages already follow it.

The inconsistency comes from one source: each mockup page brought its own composition. These are
the components that [shltr-style.md](shltr-style.md) lists under "what a theme can't do": the
`ToolbarBand`, the `PageBanner`, the energy `HeroBanner`, `FilterChips`, `StatTile`'s five
layouts, `KeyFigure`, `DarkPanel` and `Callout`. Each was placed on the page that had it in the
mockup, not by the kind of page. So equipment, docks, condition and energy look like four different
apps next to orders and customers. On top of that, teal is used for almost everything (buttons,
bands, banners, the bar before every card title, the default badge, tile icons), so nothing stands
out as the action.

**The direction:** keep Lagoon's base and the mockups' best ideas, and **decide each pattern by the
kind of page, not by the mockup**. There is one header for every page, one list, one detail page,
one form, one settings page, one KPI tile and one status vocabulary. Teal is kept for brand and
action. The personality goes where it earns its place: the dashboards' figures, the docks and
energy illustrations, and the portals.

### On the `/equipment` band

Take it off. Don't roll it out to the other lists.

- The band uses about 170 px on desktop and about 400 px on mobile (11 chips) before the search box,
  on a 514-row working list.
- Its h1 is smaller than every other page's.
- The chips duplicate the Category facet; the comment at `category-chips.svelte:5-7` says so.

Two things in it are good and worth generalising, inside the standard parts:

- **The count.** "514 units" becomes a count next to every list's title.
- **The counts per category.** Every facet in the Filter menu gets them (see
  [record-filter-counts.md](record-filter-counts.md)), with the active filters as removable pills
  under the toolbar.

The band's one legitimate use is the schedule, where it holds the period navigation and the view
switch. That is a toolbar, so it becomes a neutral one (see step 2).

## The inconsistencies

Grouped and deduplicated. **H** = visibly jarring or confusing, **M** = noticeable, **L** = polish.
The number in brackets points to the detailed finding (e.g. lists 2).

### Page headers and navigation

1. **H. Six ways to title a page.** `PageHeader` (about 50 pages) is the standard. The others:
   - `ToolbarBand` with a text-xl h1 (equipment, schedule).
   - `PageBanner` (docks, condition, checklists, partner portal).
   - Energy `HeroBanner`, with hard-coded white text and breadcrumbs inside it.
   - A hand-rolled h1 on the dashboard, on all about 17 portal pages, and on the energy report.
   - The work order.

   Each has its own button style: ghost, secondary or default. (code-system 1, 5; modules 1;
   portals 1)

2. **H. Five kinds of back navigation.** Breadcrumbs (office), a ghost "←" button (portal order,
   my order), a bottom button (shop order), a sibling button top-right (shop orders), and none at
   all (portal equipment and location, my equipment and location). (portals 2; modules 6)
3. **M. Page titles that don't match the nav.** "Digital checkpoint work order" against "Work
   orders", "Components per customer" against "Components", "Shop orders" against "Parts shop".
   (lists 17)
4. **M. Tab titles.** A 403 page's tab is titled "Something went wrong", and edit pages use three
   title patterns ("Edit A28XK6BQSK" is the serial, not the name). (shell 8; details 18)

### Lists

5. **H. Seven filter dialects.**
   - The standard Filter menu.
   - Equipment adds category chips.
   - Condition adds KPI tiles, customer chips and a checkbox.
   - Checklists has its own search, select and chips in a side list.
   - Parts shop has chips only, with no search.
   - Activity has a form with native selects and dates and a submit button.
   - Maintenance has a period select and Reset.
   - Energy alerts and the energy site use chips plus a segmented control.

   (lists 2; modules 11)

6. **M–H. Lists outside the list kit, with no search, sort, column toggle or saved views.** These
   are parts shop orders, parts shop products, the activity feed, checklist templates, energy
   alerts and partner programme years. Products also has a visible "Edit" button per row instead
   of the "…" menu. (lists 3, 6)
7. **M. Default columns too wide for 1440 px.** Orders, equipment and condition clip their last
   column under the sticky action column, with no scroll cue. (lists 9)
8. **H on phones. Every office list is a table that scrolls sideways.** Two columns show; status,
   priority and amount are off-screen. (lists 10)
9. **M. Header actions on phones.** "New x" drops to its own row; invoices stacks three buttons on
   two rows; maintenance's toolbar wraps to three lines. (lists 7, 11)

### Status, badges, colour

10. **H. Five ways to show a status.**
    - A tinted badge with an icon.
    - A badge with a chevron (inline edit, orders and engineers).
    - A tinted badge without an icon.
    - An outline badge.
    - Condition's badge, plus a coloured dot, plus a coloured bar, all showing the same health.

    The normal state ("Operational", "Normal" priority) is coloured on every row, so it's noise.
    (lists 5, 14; portals 10)

11. **M. Badge variants mean different things per theme.** Lagoon makes `secondary` info-blue, so
    "Paused", "Enabled since" and counts look like the info tone. Partner levels are a second
    colour system: UPPERCASE metal variants in four colour families. Docks labels are uppercase.
    "Nominal" and "Normal" both name one state on one page. (code-system 14, 15; modules 9)
12. **H. Teal does every job.** Primary buttons, bands and banners, the logo, active nav, the
    default badge, the bar before every section-card title (also on nested tiles and the login),
    the chips and the tile icons. Colour is decoration rather than meaning. (shell 2)
13. **M. The primary button fails contrast.** White on `--primary` (teal-600) is about 3.7:1,
    below WCAG AA for 14 px text. (shell 4)
14. **M. Hard-coded palettes outside the tokens.**
    - Energy: door card, building overview, consumption chart, hero.
    - Docks: drawing and display.
    - The navy wallet panel.
    - Orange and sky charts.
    - The report form's native blue radio.

    (code-system 7; modules 8; portals 6, 15)

### Cards, tiles, type, spacing

15. **M. Card titles change size with the card's structure.** 14 px with a teal bar when the
    header is followed by content; 16 px when the card has a header only. A title-only header is
    49 px tall against 70 px with a description, so the headers in one row don't line up. Small
    blocks on phones carry about 25% chrome. (shell 3; details 8; portals 9)
16. **M. Several KPI tiles.**
    - Five `StatTile` layouts.
    - Energy's `KpiTile`, which takes its tone as a class string.
    - Section cards used as tiles (energy zone, energy portal, with empty bodies).
    - Partner's `KeyFigure`.
    - Customer detail's row layout.

    Their colours are decorative: open doors are blue, and a "0 not locked" is red although 0 is
    good. (code-system 10; details 2; modules 7; portals 8)

17. **M. The type scale drifts.**
    - h1 is text-2xl or text-xl.
    - The subtitle is 16 px under a 24 px h1.
    - Font sizes off the scale: 25 uses of 10–11 px (`text-[0.6875rem]`, `text-[0.625rem]`), and
      7–9 px in drawings.
    - Portal rows are 16 px bold against 14 px office rows.

    (code-system 6, 8; shell 14, 15)

18. **L–M. Radii.** 4, 6, 8 and 10 px plus pills all appear on one screen. Lagoon promises 8 px.
    (code-system 9; shell 5)
19. **M. Widths.**
    - Settings and form pages use `max-w-2xl`, `max-w-3xl`, `max-w-4xl` and `max-w-5xl`, or none
      (`RecordForm`).
    - Page actions sit at the far right of 1440 px while the content stops at 672 px.
    - The portals use 1400 px and `max-w-xl`.

    (code-system 12; modules 4; details 9; portals 13)

20. **L–M. Four or more empty-state styles.** These are `Empty` with an icon, `Empty` without one,
    `Empty` with a border, a plain `<p>` in a card, and a table row. (code-system 17; details 16;
    portals 17)

### Detail pages and forms

21. **H. Destructive actions are styled per page.** Delete is red (the majority), but the
    location's Delete and the shop order's Cancel are neutral, and Void is red. The header actions
    run from 0 to 4 buttons, and the primary comes first on some pages and last on others.
    (details 1, 4)
22. **H. Unbounded related lists.** Materials detail is 9,649 px (all usage and stock history);
    engineers lists 32 open orders; contracts lists 19 units. Customers and equipment cap at 10
    with "View all". (details 3)
23. **M. Detail layouts.** Columns (the majority), masonry (equipment, chosen on purpose, see
    [equipment-masonry.md](equipment-masonry.md)), and two unrelated "document" pages: the invoice
    and the work order. On phones the facts come after the big tables. (details 6, 14, 17)
24. **M. Forms.**
    - Selects are white while inputs are grey.
    - Grids leave holes and misalign under hints.
    - Native dd/mm/yyyy dates ignore the locale.
    - The invoice detail has three ad-hoc inline forms with larger labels.
    - Tall forms keep their buttons at the very bottom.

    (details 10–13)

### Module pages

25. **H. Settings pages share a layout in 5 of 11 cases.** `ModuleSettingsPage` serves invoices,
    maintenance, condition, energy and docks; the others roll their own. The "Only owners and
    admins…" notice comes in five placements and wordings, and planners see it on pages they
    can't edit. (modules 2, 3)
26. **M. Module dashboards are demo-length.** Docks is 2,900 px with explainer cards that never
    change. Energy site is 6,500 px (12,000 on a phone) and carries the whole alerts list again.
    Schedule is 4,600 px with a 41-card backlog. Condition's four explainer cards push its table to
    1,500 px down on a phone. (modules 10, 12; lists, condition)

### Shell, dashboard, portals

27. **M. Top bar clutter.** Four unlabelled icons plus a theme picker (a dev feature) for every
    user, the login page included. The customer portal's top bar squeezes the customer's name to
    "Riedel…". (shell 7; portals 4)
28. **M. The sidebar groups aren't a model.** "Records" holds modules (Work orders, Components,
    Docks…) and "Modules" holds others. "Work orders" sits next to "Orders". (shell 6)
29. **M–H. The dashboard, the first screen.**
    - Nine tiles in a 7-column grid, with two orphans.
    - "View" buttons on 4 of the 9 tiles.
    - Masonry columns of unequal height.
    - Four header-action wordings.
    - Nine full-width tiles before any content on a phone.

    (shell 9, 10)

30. **M. Error pages.**
    - The 404 renders without the shell.
    - It says "Not found" twice.
    - Both 403 and 404 offer "Reload".
    - Settings is reachable by a planner whose sub-pages then 403.

    (shell 8)

31. **M. Orders in four list formats.** The office table, the portal table and card pair, a
    header-less shop table, and the engineer's `WorkCard`. (portals 3)
32. **M. Portal mobile.**
    - No visible navigation in the customer portal, and no persistent "Report a breakdown".
    - The engineer's buttons are 36 px.
    - "Complete job" sits 2,800 px down the page.

    (portals 5, 12)

33. **M. The wallet three ways.** A navy panel, a teal callout, and plain rows. (portals 6)

### Bugs seen on the way (not style)

- The shop order reads "Placed 21 Aug 2026, 00:00 by someone": no user, and a fake time.
- The portal home says 26 open orders where the Orders tab says 25.
- The orders list's "select all" silently selects 100, the page size.
- Energy index shows 0 kW for a site with live data on its own page.
- The dashboard's three charts were blank in the capture. **Not verified live.**

## What to keep (the mockups' good ideas)

- Lagoon's base: grey page, white hairline cards without shadows, muted inputs, tinted square
  status badges, pale-teal active nav, small-caps group labels. The login card.
- `ListToolbar` and its mobile layout, the selection bar, and the two-line "primary + muted" cells.
- Materials' "Low" and "Out of stock" badges, which show a state only when it's abnormal. That is
  the rule for all statuses.
- Condition's KPI tiles as filters, and the dashboard's stacked tile: the best at-a-glance element.
- Equipment's service timeline; the order's "label above value" Schedule card; the progress-bar
  cell in the partner list; the invoice's meta block.
- `WorkCard`: the best list item in the product. The customer portal's table-to-cards list. The
  urgency radio cards. The shop's sticky cart.
- `ModuleSettingsPage` and `RecordPage`.
- The docks and energy illustrations: the only real personality. They stay, as one-offs on their
  own pages, in tokens.

## The system to converge on

Every rule below names the one component that carries it. Each step adds a guard spec where the
kit's style allows, so the drift can't come back.

| Concern         | The one way                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title      | `PageHeader`, everywhere (office, portals, modules). It gains `count` (a muted "514" beside the title), `back` (a "← Parent" link for portals and documents) and an `eyebrow`/badges slot (live, simulation). It sets `<title>`.                                                                                                                                                                               |
| Overview hero   | **Decision A.** Either none, or one `OverviewHero` (the merged `PageBanner` + `HeroBanner`, token colours, breadcrumbs outside) only on dashboard landings: docks, energy site, partner portal, perhaps the customer portal home. Never on lists, details, forms or settings.                                                                                                                                  |
| List            | `ListLayout`: search, Filter (facets with counts), Saved views, View, the "…" row menu. Active filters show as pills under the toolbar. Optionally one summary row (`ListSummary`, `StatTile`s that set a filter) where the numbers mean more than a row count (condition's health, maintenance's due), at most once per page. No chip rows. A time scope (maintenance's period) is allowed as a toolbar slot. |
| List on phones  | Below `md`, rows render as cards from one row snippet, `OrderCard`/`WorkCard`-style (title, status, two meta lines). Bigger work: its own step.                                                                                                                                                                                                                                                                |
| Status          | `EnumBadge` with tone and icon for states. The normal state is shown muted (text or a grey dot), not coloured. Categories (level, segment, type) are outline or plain text. Sentence case and one word per state. Inline edit shows a chevron on hover only.                                                                                                                                                   |
| Badge variants  | Lagoon's `secondary` is neutral grey, not info. Partner levels become a `level` tone set in sentence case. Metal colours stay inside it.                                                                                                                                                                                                                                                                       |
| Teal            | Brand (logo, sidebar), **the one primary action per page**, active nav, focus, links, a selected chip. Not large surfaces, decoration, tile icons or status. The fill darkens to about teal-700 for AA; teal-600 stays as `--brand`.                                                                                                                                                                           |
| Section cards   | The header band for cards with a list or table; small blocks are content-only cards. Card titles are 14/600 in every structure. **Decision B:** keep the teal title bar or drop it.                                                                                                                                                                                                                            |
| KPI tile        | `StatTile` with two layouts: `stacked` (dashboard, detail pages, portals) and `inline`. The tone is a semantic token. `KpiTile`, the row layout and section-cards-as-tiles go. Colour only where the number signals something.                                                                                                                                                                                 |
| Type and radius | h1 24/600; subtitle 14 muted, `max-w-prose`; card title 14/600; body 14; meta 12; **nothing under 12** outside illustrations. Radius 8 for containers, 8 for controls, 4 for badges, full for chips and avatars.                                                                                                                                                                                               |
| Width           | Office lists and details: full width. Forms and settings: one width (`max-w-4xl`) for the **whole page, header included**. Documents (invoice, work order, report): one `DocumentSheet`.                                                                                                                                                                                                                       |
| Detail page     | `RecordPage` with columns (equipment keeps masonry). Actions: secondary outline; destructive (Delete, Cancel, Void) always red-tinted; primary last; more than 3 go into a "…" menu. Related lists capped at 10 with "View all" to the filtered list. On phones the first side card (the facts) comes first.                                                                                                   |
| Form            | `RecordForm`: select fill equals input fill; hints don't break the grid; sticky action bar when taller than the viewport. The invoice's inline forms become one `InlineFormCard`.                                                                                                                                                                                                                              |
| Settings        | `ModuleSettingsPage` for every module (add a "sections/table" slot), with one read-only notice shown only to viewers who can't edit.                                                                                                                                                                                                                                                                           |
| Empty           | One `EmptyState` (icon, title, sentence, action) with a `compact` size for inside cards.                                                                                                                                                                                                                                                                                                                       |
| Wallet          | One `WalletSummary` (compact and full); no navy panel, or navy exactly once.                                                                                                                                                                                                                                                                                                                                   |
| Errors          | One error page inside the shell when signed in. A lock or search icon, a real title ("You don't have access", "Page not found"), one primary "Back to dashboard", no Reload.                                                                                                                                                                                                                                   |

## The plan

Seven steps. Step 1 is global and low-risk; it makes everything else look closer right away.
Steps 3–7 touch disjoint files after step 2, so they can run as parallel sessions in worktrees, one
writer per area, each adding its guard spec.

1. **Lagoon tokens** (`src/lib/themes/lagoon.ts`, one file).
   - Darken `--primary` and add `--brand`.
   - Make `secondary` neutral.
   - Card titles 14/600 in every structure (and decision B).
   - Select fill equal to input fill; theme the radio's `accent-color`.
   - Badge text 12 px; radii per the table.
   - Subtitle 14 px (`page-header.svelte:77`).
   - Check the other five themes still look right (theme spec).
2. **One header** (wide, so it goes first and alone).
   - Add `count`, `back` and an eyebrow slot to `PageHeader`.
   - Move equipment, schedule, docks, condition, checklists, energy site, energy report, the
     dashboard, the work order and all portal pages onto it.
   - Delete `ToolbarBand` and `CategoryChips`.
   - Decision A decides `PageBanner`/`HeroBanner`: merge them or delete them.
   - Schedule's period navigation and view switch move into a neutral toolbar row
     (`SegmentedNav`, default variant).
   - Rename the titles to match the nav (finding 3).
   - Guard spec: no `<h1>` and no `<svelte:head><title>` in a `+page.svelte` or page component
     outside `PageHeader` (with an allow-list for documents).
3. **Lists.**
   - Facet counts in the Filter menu and active-filter pills.
   - `ListSummary` for condition's tiles (drop its chips and checkbox into facets, its explainer
     behind a closed "How it works").
   - Put parts shop orders, products, checklist templates and asset list, energy alerts, partner
     years and the activity filters onto `ListLayout` and the toolbar.
   - Tune the default columns to fit 1440 px minus the sidebar, with a scroll fade.
   - Guard spec: `FilterChips` only inside the kit's list parts (or delete it).
4. **Status vocabulary.**
   - Every enum shown through `EnumBadge`; the normal state muted.
   - A partner level tone set; sentence case.
   - Condition: badge + bar, no dot.
   - "Nominal"/"Normal" become one word.
   - Guard spec: no `Badge` with an enum `label()` outside `EnumBadge`.
5. **Detail pages and forms.**
   - `RecordPage` actions rule (destructive tint, order, overflow menu).
   - Cap related lists at 10.
   - Facts first on phones.
   - `StatTile` stacked on all detail pages.
   - `RecordForm` width, grid and sticky bar.
   - `DocumentSheet` for the invoice, work order and energy report.
   - `InlineFormCard`.
   - One `EmptyState`.
6. **Module pages.**
   - Every settings page onto `ModuleSettingsPage` at one width.
   - Trim the dashboards: docks' explainers to a "How it works" disclosure or the settings page;
     the energy site's alerts list becomes a link with a count; cap the schedule backlog.
   - `KpiTile` becomes `StatTile`.
   - Chart and illustration colours to `--chart-*` and the state tokens.
   - Guard: extend `state-colours.spec.ts` by shrinking its allow-list.
7. **Shell, dashboard and portals.**
   - Shell:
     - Top bar: bell and feedback; language, theme and colour mode move to the user menu; the
       theme picker only in dev or for owners.
     - Sidebar grouped by task.
     - The order count as a pill.
     - Error pages.
     - Settings sub-pages hidden from those who can't open them.
   - Dashboard:
     - 4 or 5 equal tiles, whole-tile links, 2-up on phones.
     - Widgets in an equal-height 2-column grid with "View all".
   - Portals:
     - `PageHeader` with `back` (from step 2).
     - `OrderCard` from `WorkCard` for the portal lists.
     - Customer portal bottom nav, or a persistent "Report a breakdown".
     - Engineer buttons `lg` and a sticky "Complete job".
     - `WalletSummary`.

Then, as its own piece: **lists as cards on phones** (finding 8), built on `OrderCard` and
`ListLayout`'s row snippet.

The bugs in "Bugs seen on the way" are separate small fixes.

## Decisions before starting

- **A. Hero banners.** My recommendation is to keep one `OverviewHero` for the three or four
  dashboard landings. It's the mockups' strongest visual and the client will look for it. But it
  stays off every list, detail, form and settings page. The alternative is no banners at all
  (`PageHeader` only): the most consistent and the calmest, at the cost of the most recognisable
  mockup element.
- **B. The teal bar before card titles.** My recommendation is to drop it. It's 2 px, nearly
  invisible, and adds teal everywhere. The header band and divider carry the section look on their
  own.
- **C. Lists as cards on phones.** Do it, or keep sideways scrolling and only tune the columns.
- **D. Explainer content on module dashboards** (docks, condition, energy). Move it to a closed
  "How it works" disclosure, or to the module's settings page or docs.
