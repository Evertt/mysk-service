# One look for the whole app: the UI consistency plan

> **Revised after the UX discovery**
> ([2026-10-23-fieldworks-discovery.md](../ux-discovery/2026-10-23-fieldworks-discovery.md),
> section 7):
>
> - Decisions A–D are settled.
> - Step 1 is a theme built from SHLTR's own brand: night blue, white and mint. The light teal was
>   Lovable's default.
> - The dashboard becomes the planner's "needs attention today" view.
>
> The discovery is an interview with a role-played product owner. Its open questions (section 9)
> may still change these choices.

Review of 23 October 2026, of every page of `develop` (e5d7b392) as the shltr planner, engineer and
customer, in the Lagoon theme, at 1440 px and 390 px. The per-area findings, with file references,
are in [`docs/reviews/ui-consistency/`](../reviews/ui-consistency/):
[code-system](../reviews/ui-consistency/code-system.md) (the system and its primitives, from the
code), [shell](../reviews/ui-consistency/shell.md) (shell, dashboard, settings, error pages, the
theme), [lists](../reviews/ui-consistency/lists.md),
[details-forms](../reviews/ui-consistency/details-forms.md),
[modules](../reviews/ui-consistency/modules.md) and [portals](../reviews/ui-consistency/portals.md).
How Lagoon copies the mockup is in [shltr-style.md](shltr-style.md).

A second, independent audit of the office app is included:
[office-audit-2](../reviews/ui-consistency/office-audit-2.md), by another model, in Dutch, at
1600 px and at a 1038 px window. The narrow window and the longer Dutch words surfaced layout
breakage that 1440 px in English hides. Findings taken from it are marked _(audit 2)_. Where this
plan disagrees with it:

- The dashboard's `stacked` tile is the target, not the outlier.
- `/checklists/settings` has no actions because a planner can't edit it.
- The chart palette is deliberate (the colours map to statuses), so it shouldn't be desaturated.

**Lesson for later reviews:** capture at 1024, 1280 and 1440 px, in Dutch as well as English.

## The diagnosis in short

The foundation is good and mostly consistent: `PageHeader`, `ListLayout`/`ListToolbar`,
`RecordPage`, `RecordForm`, `EnumBadge`, and Lagoon's calm base (grey page, white hairline cards,
tinted square status badges). About 50 pages already follow it. Two problems sit underneath every
page:

- **The layout breaks below about 1280 px.** The breakpoints go by the window, not by the content
  area beside the sidebar.
- **Hidden scrollbars hide content.** The sidebar and the tables give no sign that there's more.

The inconsistency comes from one source: each mockup page brought its own composition. These are
the components that [shltr-style.md](shltr-style.md) lists under "what a theme can't do": the
`ToolbarBand`, the `PageBanner`, the energy `HeroBanner`, `FilterChips`, `StatTile`'s five
layouts, `KeyFigure`, `DarkPanel` and `Callout`. Each was placed on the page that had it in the
mockup, not by the kind of page. So equipment, docks, condition and energy look like four different
apps next to orders and customers. On top of that, teal is used for almost everything (buttons,
bands, banners, the bar before every card title, the default badge, tile icons), so nothing stands
out as the action.

**The direction:** keep the calm base and the mockups' best ideas, and **decide each pattern by the
kind of page, not by the mockup**. There is one header for every page, one list, one detail page,
one form, one settings page, one KPI tile and one status vocabulary.

The colours come from SHLTR's brand, "Engineered Clarity":

- White working surfaces.
- Colour only for status.
- Mint for progress and the primary action.
- Night blue for the brand's areas.

Each audience gets its own density: the planner's office app dense and calm, the engineer's views
one thing per screen with big targets, the customer portal spacious and the most branded. The
banners and drawings were pitch material: no banners, and the docks and energy illustrations stay
contained in their modules.

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
5. **M. Links to a module's settings sit in three places.** In the header actions (invoices); as a
   button under the title on the left (maintenance, energy, partner programme, parts shop
   products); inside the banner (condition, docks). The settings pages are named in five patterns
   ("Facturatie-instellingen", "Instellingen onderdelenbeheer", "Salvo-koppeling",
   "Energie-instellingen", "Onderhoudsinstellingen"). _(audit 2)_
6. **L. Names said twice.** The breadcrumb repeats the title ("Onderhoudsplannen >
   Onderhoudsinstellingen" on maintenance and energy settings), and the contract subtitle repeats
   the level ("Servicecontract Standaard voor …"). _(audit 2)_

### Lists

7. **H. Seven filter dialects.**
   - The standard Filter menu.
   - Equipment adds category chips.
   - Condition adds KPI tiles, customer chips and a checkbox.
   - Checklists has its own search, select and chips in a side list.
   - Parts shop has chips only, with no search.
   - Activity has a form with native selects and dates and a submit button.
   - Maintenance has a period select and Reset.
   - Energy alerts and the energy site use chips plus a segmented control.

   (lists 2; modules 11)

8. **M–H. Lists outside the list kit, with no search, sort, column toggle or saved views.** These
   are parts shop orders, parts shop products, the activity feed, checklist templates, energy
   alerts and partner programme years. Products also has a visible "Edit" button per row instead
   of the "…" menu. (lists 3, 6)
9. **M. Default columns too wide for 1440 px.** Orders, equipment and condition clip their last
   column under the sticky action column, with no scroll cue. (lists 9)
10. **H on phones. Every office list is a table that scrolls sideways.** Two columns show; status,
    priority and amount are off-screen. (lists 10)
11. **M. Header actions on phones.** "New x" drops to its own row; invoices stacks three buttons on
    two rows; maintenance's toolbar wraps to three lines. (lists 7, 11)
12. **M. Two toolbar menus can be open at once.** Saved views and View overlap, and one hides the
    other's first items. _(audit 2)_
13. **M. The schedule's controls move per view.** The view switch sits beside the arrows in month,
    below them in week, and on a row of its own in day. Only month shows the order-type legend.
    Month chips truncate to "08:30 Rie…". _(audit 2)_
14. **L. Mixed cells.** Materials' stock column puts a warning badge and "0 st." in one
    right-aligned cell. _(audit 2)_

### Narrow windows and scrolling _(audit 2)_

15. **H. The sidebar is cut off with no sign of it.** `sidebar-content.svelte:22` sets
    `no-scrollbar`. At a laptop's height the nav doesn't fit, so a planner sees only "Service
    contracts" under Modules; Energy, Invoicing and Partner programme are below the fold. The
    tables hide their scrollbars too. Nothing tells the user there's more.
16. **H. `/maintenance` scrolls the whole page sideways at narrower widths.** The period select
    makes the content 886 px wide in a 782 px column, and the header pans with it. The toolbar
    never wraps (`sm:flex-nowrap` with `shrink-0` controls), so any extra tool overflows.
17. **H. The detail side column gets too narrow.** `RecordPage`'s `lg:grid-cols-3` goes by the
    window. With the sidebar open, a 1038 px window leaves the side column 229–245 px wide, and its
    two-column label/value grids about 97 px per column. That breaks:
    - Text: "Ambachtswe g 74", "AangemaaktGepland", and "facilita…" clipped.
    - The invoice's "Toevoegen aan de factuur" card: the price is cut off.
    - The activity card on engineers and materials: the title bar floats, and "View all" sits
      above the title.

    The fix is layout by the content's width (container queries), not another column count.

18. **M. Crushed and clipped panels.**
    - The checklist asset panel's title collapses to about 50 px, and "Keuring 2026" overlaps it.
    - Energy settings' "Locaties en codes" clips the Doors column (the zone list doesn't wrap).
    - Long emails are truncated in one place and broken mid-word in another.

### Status, badges, colour

19. **H. Five ways to show a status.**
    - A tinted badge with an icon.
    - A badge with a chevron (inline edit, orders and engineers).
    - A tinted badge without an icon.
    - An outline badge.
    - Condition's badge, plus a coloured dot, plus a coloured bar, all showing the same health.

    The normal state ("Operational", "Normal" priority) is coloured on every row, so it's noise.
    (lists 5, 14; portals 10)

20. **M. Badge variants mean different things per theme.** Lagoon makes `secondary` info-blue, so
    "Paused", "Enabled since" and counts look like the info tone. Partner levels are a second
    colour system: UPPERCASE metal variants in four colour families. Docks labels are uppercase.
    "Nominal" and "Normal" both name one state on one page. One value changes style between list
    and detail: "Werktuigbouw" is blue in the engineers table and neutral on the engineer's page
    _(audit 2)_. (code-system 14, 15; modules 9)
21. **H. Teal does every job.** Primary buttons, bands and banners, the logo, active nav, the
    default badge, the bar before every section-card title (also on nested tiles and the login),
    the chips and the tile icons. Colour is decoration rather than meaning. (shell 2)
22. **M. The primary button fails contrast.** White on `--primary` (teal-600) is about 3.7:1,
    below WCAG AA for 14 px text. (shell 4)
23. **M. Hard-coded palettes outside the tokens.**
    - Energy: door card, building overview, consumption chart, hero.
    - Docks: drawing and display.
    - The navy wallet panel.
    - Orange and sky charts.
    - The report form's native blue radio.

    (code-system 7; modules 8; portals 6, 15)

### Cards, tiles, type, spacing

24. **M. Card titles change size with the card's structure.** 14 px with a teal bar when the
    header is followed by content; 16 px when the card has a header only. A title-only header is
    49 px tall against 70 px with a description, so the headers in one row don't line up. Small
    blocks on phones carry about 25% chrome. (shell 3; details 8; portals 9)
25. **M. Several KPI tiles.**
    - Five `StatTile` layouts.
    - Energy's `KpiTile`, which takes its tone as a class string.
    - Section cards used as tiles (energy zone, energy portal, with empty bodies).
    - Partner's `KeyFigure`.
    - Customer detail's row layout.

    Their colours are decorative: open doors are blue, and a "0 not locked" is red although 0 is
    good. Tiles in one row differ in height when one has a footer note _(audit 2)_. (code-system
    10; details 2; modules 7; portals 8)

26. **M. The type scale drifts.**
    - h1 is text-2xl or text-xl.
    - The subtitle is 16 px under a 24 px h1.
    - Font sizes off the scale: 25 uses of 10–11 px (`text-[0.6875rem]`, `text-[0.625rem]`), and
      7–9 px in drawings.
    - Portal rows are 16 px bold against 14 px office rows.

    (code-system 6, 8; shell 14, 15)

27. **L–M. Radii.** 4, 6, 8 and 10 px plus pills all appear on one screen. Lagoon promises 8 px.
    (code-system 9; shell 5)
28. **M. Widths.**
    - Settings and form pages use `max-w-2xl`, `max-w-3xl`, `max-w-4xl` and `max-w-5xl`, or none
      (`RecordForm`).
    - Page actions sit at the far right of 1440 px while the content stops at 672 px.
    - The portals use 1400 px and `max-w-xl`.

    (code-system 12; modules 4; details 9; portals 13)

29. **L–M. Four or more empty-state styles.** These are `Empty` with an icon, `Empty` without one,
    `Empty` with a border, a plain `<p>` in a card, and a table row. (code-system 17; details 16;
    portals 17)

### Detail pages and forms

30. **H. Destructive actions are styled per page.** Delete is red (the majority), but the
    location's Delete and the shop order's Cancel are neutral, and Void is red. The header actions
    run from 0 to 4 buttons, and the primary comes first on some pages and last on others.
    (details 1, 4)
31. **H. Unbounded related lists.** Materials detail is 9,649 px (all usage and stock history);
    engineers lists 32 open orders; contracts lists 19 units. Customers and equipment cap at 10
    with "View all". (details 3)
32. **M. Detail layouts.** Columns (the majority), masonry (equipment, chosen on purpose, see
    [equipment-masonry.md](equipment-masonry.md)), and two unrelated "document" pages: the invoice
    and the work order. On phones the facts come after the big tables. (details 6, 14, 17)
33. **M. Forms.**
    - **Text fields look disabled** _(audit 2)_. Lagoon gives inputs, textareas and input groups a
      grey `bg-muted/60` fill whose border barely shows (`lagoon.ts:133-141`), while selects are
      white with a border. Side by side ("Naam" next to "Segment"), the text fields read as
      disabled. Making the selects grey too would make everything look disabled.
    - Grids leave holes and misalign under hints.
    - The new invoice's "Wat je factureert" card is blank until a customer is chosen, with no
      explanation _(audit 2)_.
    - Native dd/mm/yyyy dates ignore the locale.
    - The invoice detail has three ad-hoc inline forms with larger labels.
    - Tall forms keep their buttons at the very bottom.

    (details 10–13)

### Module pages

34. **H. Settings pages share a layout in 5 of 11 cases.** `ModuleSettingsPage` serves invoices,
    maintenance, condition, energy and docks; the others roll their own. The "Only owners and
    admins…" notice comes in five placements and wordings, and planners see it on pages they
    can't edit. (modules 2, 3)
35. **M. Module dashboards are demo-length.** Docks is 2,900 px with explainer cards that never
    change. Energy site is 6,500 px (12,000 on a phone) and carries the whole alerts list again.
    Schedule is 4,600 px with a 41-card backlog. Condition's four explainer cards push its table to
    1,500 px down on a phone. Energy's index is the opposite: one card a third of the page wide,
    with no list, search or call to action _(audit 2)_. (modules 10, 12; lists, condition)

### Shell, dashboard, portals

36. **M. Top bar clutter.** Four unlabelled icons plus a theme picker (a dev feature) for every
    user, the login page included. The customer portal's top bar squeezes the customer's name to
    "Riedel…". (shell 7; portals 4)
37. **M. The sidebar groups aren't a model.** "Records" holds modules (Work orders, Components,
    Docks…) and "Modules" holds others. "Work orders" sits next to "Orders". (shell 6)
38. **M–H. The dashboard, the first screen.**
    - Nine tiles in a 7-column grid, with two orphans.
    - "View" buttons on 4 of the 9 tiles.
    - Masonry columns of unequal height.
    - Four header-action wordings.
    - Nine full-width tiles before any content on a phone.

    (shell 9, 10)

39. **M. Error pages.**
    - The 404 renders without the shell.
    - It says "Not found" twice.
    - Both 403 and 404 offer "Reload", and "Back" next to "Back to the dashboard" _(audit 2)_.
    - Settings is reachable by a planner whose sub-pages then 403.

    (shell 8)

40. **M. Orders in four list formats.** The office table, the portal table and card pair, a
    header-less shop table, and the engineer's `WorkCard`. (portals 3)
41. **M. Portal mobile.**
    - No visible navigation in the customer portal, and no persistent "Report a breakdown".
    - The engineer's buttons are 36 px.
    - "Complete job" sits 2,800 px down the page.

    (portals 5, 12)

42. **M. The wallet three ways.** A navy panel, a teal callout, and plain rows. (portals 6)

### Bugs seen on the way (not style)

- The shop order reads "Placed 21 Aug 2026, 00:00 by someone": no user, and a fake time.
- The portal home says 26 open orders where the Orders tab says 25.
- The orders list's "select all" silently selects 100, the page size.
- Energy index shows 0 kW for a site with live data on its own page.
- The dashboard's three charts were blank in the capture. **Not verified live.**
- The engineer portal's 404s show message keys: "Opdracht equipment niet gevonden", "Opdracht
  locations niet gevonden" _(audit 2)_.

## What to keep (the mockups' good ideas)

- Lagoon's base: grey page, white hairline cards without shadows, tinted square status badges,
  pale-teal active nav, small-caps group labels. The login card. (Not the grey input fill: see
  "Forms".)
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

| Concern         | The one way                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title      | `PageHeader`, everywhere (office, portals, modules). It gains `count` (a muted "514" beside the title), `back` (a "← Parent" link for portals and documents) and an `eyebrow`/badges slot (live, simulation). It sets `<title>`.                                                                                                                                                                                                                          |
| Overview hero   | **None (decision A).** `PageBanner`, `HeroBanner` and `ToolbarBand` go; live or simulation badges sit in `PageHeader`'s eyebrow slot.                                                                                                                                                                                                                                                                                                                     |
| Dashboard       | The planner's **"needs attention today"** view (job P1 in the discovery): orders to accept, critical units (condition below 40% or inspection expired), inspections and contract visits due, overdue on top; each row leads to planning it. It keeps its place (filters and scroll) through interruptions. A few `StatTile`s at most, as counts of those lists. Partner bonus, wallet and revenue widgets leave the office dashboard.                     |
| List            | `ListLayout`: search, Filter (facets with counts), Saved views, View, the "…" row menu. Active filters show as pills under the toolbar. Optionally one summary row (`ListSummary`, `StatTile`s that set a filter) where the numbers mean more than a row count (condition's health, maintenance's due), at most once per page. No chip rows. A time scope (maintenance's period) is allowed as a toolbar slot.                                            |
| List on phones  | **Engineer and customer views (decision C):** cards, `OrderCard`/`WorkCard`-style (title, status, two meta lines). The office lists stay dense tables (the planner works at a desk), with tuned default columns and a scroll cue on phones.                                                                                                                                                                                                               |
| Status          | `EnumBadge` with tone and icon for states. The normal state is shown muted (text or a grey dot), not coloured. Categories (level, segment, type) are outline or plain text. Sentence case and one word per state. Inline edit shows a chevron on hover only.                                                                                                                                                                                              |
| Badge variants  | Lagoon's `secondary` is neutral grey, not info. Partner levels become a `level` tone set in sentence case. Metal colours stay inside it.                                                                                                                                                                                                                                                                                                                  |
| Colour          | A **SHLTR theme from the brand**: white working surfaces; status colours only for status; **mint** for progress and **the one primary action per page** (and focus, links, a selected chip), dark enough for AA with its text; **night blue** for brand areas (sidebar or logo, the portal's header). No large coloured surfaces, no decoration, no coloured tile icons. The customer portal carries the brand (or a white-label tenant's) most strongly. |
| Section cards   | The header band for cards with a list or table; small blocks are content-only cards. Card titles are 14/600 in every structure. **No coloured title bar (decision B).**                                                                                                                                                                                                                                                                                   |
| KPI tile        | `StatTile` with two layouts: `stacked` (dashboard, detail pages, portals) and `inline`. The tone is a semantic token. `KpiTile`, the row layout and section-cards-as-tiles go. Colour only where the number signals something.                                                                                                                                                                                                                            |
| Type and radius | h1 24/600; subtitle 14 muted, `max-w-prose`; card title 14/600; body 14; meta 12; **nothing under 12** outside illustrations. Radius 8 for containers, 8 for controls, 4 for badges, full for chips and avatars.                                                                                                                                                                                                                                          |
| Width           | Office lists and details: full width. Forms and settings: one width (`max-w-4xl`) for the **whole page, header included**. Documents (invoice, work order, report): one `DocumentSheet`.                                                                                                                                                                                                                                                                  |
| Detail page     | `RecordPage` with columns (equipment keeps masonry). Actions: secondary outline; destructive (Delete, Cancel, Void) always red-tinted; primary last; more than 3 go into a "…" menu. Related lists capped at 10 with "View all" to the filtered list. On phones the first side card (the facts) comes first.                                                                                                                                              |
| Scrolling       | Scrollable areas show they scroll: a thin scrollbar in the sidebar, an edge fade on tables. Toolbars and header actions wrap instead of overflowing. Only one toolbar menu is open at a time. Layouts beside the sidebar respond to the content's width (container queries), not the window's.                                                                                                                                                            |
| Form            | `RecordForm`: every field white with a visible border (the grey fill only as hover); hints don't break the grid; an empty dependent section says what unlocks it; sticky action bar when taller than the viewport. The invoice's inline forms become one `InlineFormCard`.                                                                                                                                                                                |
| Settings        | `ModuleSettingsPage` for every module (add a "sections/table" slot), with one read-only notice shown only to viewers who can't edit. The link to it is always a header action; its title follows one pattern ("Settings: Invoicing"); no breadcrumb repeats the title.                                                                                                                                                                                    |
| Empty           | One `EmptyState` (icon, title, sentence, action) with a `compact` size for inside cards.                                                                                                                                                                                                                                                                                                                                                                  |
| Wallet          | One `WalletSummary` (compact and full); no navy panel, or navy exactly once.                                                                                                                                                                                                                                                                                                                                                                              |
| Errors          | One error page inside the shell when signed in. A lock or search icon, a real title ("You don't have access", "Page not found"), one primary "Back to dashboard", no Reload.                                                                                                                                                                                                                                                                              |

## The plan

Seven steps. Step 1 is global and low-risk; it makes everything else look closer right away.
Steps 3–7 touch disjoint files after step 2, so they can run as parallel sessions in worktrees, one
writer per area, each adding its guard spec.

1. **A SHLTR theme from the brand** (a new `src/lib/themes/shltr.ts`, made the default; Lagoon
   stays as one of the themes).
   - Start from Lagoon's calm base: grey page, white hairline cards, tinted square status badges.
   - Tokens from the brand:
     - `--primary` mint, AA with its text.
     - Night blue for `--sidebar` or the brand areas and the logo tile.
     - Neutral accents.
     - Status tones unchanged.

     The exact values come from SHLTR's brand material: ask the client for the brochure's colours
     and typeface. MF describes "een verfijnde grotesk" (a refined grotesque) and "hoge, compacte
     koppen" (tall, compact headings).

   - Make `secondary` neutral.
   - Card titles 14/600 in every structure, with no coloured title bar.
   - Fields: inputs, textareas and input groups white with a visible `--input` border, like the
     selects (the grey fill only on hover); theme the radio's `accent-color`.
   - Badge text 12 px; radii per the table.
   - Subtitle 14 px (`page-header.svelte:77`).
   - Check the other themes still look right (theme spec).
   - A white-label tenant later gets its own tokens the same way.
2. **One header** (wide, so it goes first and alone).
   - Add `count`, `back` and an eyebrow slot to `PageHeader`.
   - Move equipment, schedule, docks, condition, checklists, energy site, energy report, the
     dashboard, the work order and all portal pages onto it.
   - Delete `ToolbarBand` and `CategoryChips`.
   - Delete `PageBanner` and `HeroBanner` too (decision A).
   - Schedule's period navigation and view switch move into a neutral toolbar row
     (`SegmentedNav`, default variant).
   - Rename the titles to match the nav (finding 3).
   - Guard spec: no `<h1>` and no `<svelte:head><title>` in a `+page.svelte` or page component
     outside `PageHeader` (with an allow-list for documents).
3. **Lists.**
   - Facet counts in the Filter menu and active-filter pills.
   - `ListSummary` for condition's tiles (drop its chips and checkbox into facets, its explainer
     cards off the page, see decision D).
   - Put parts shop orders, products, checklist templates and asset list, energy alerts, partner
     years and the activity filters onto `ListLayout` and the toolbar.
   - Tune the default columns to fit 1440 px minus the sidebar, with a scroll fade and a visible
     scrollbar.
   - The toolbar wraps instead of overflowing (drop `sm:flex-nowrap`/`shrink-0`; fixes
     maintenance's sideways page). Opening one toolbar menu closes the other.
   - Guard spec: `FilterChips` only inside the kit's list parts (or delete it).
4. **Status vocabulary.**
   - Every enum shown through `EnumBadge`; the normal state muted.
   - A partner level tone set; sentence case.
   - Condition: badge + bar, no dot.
   - "Nominal"/"Normal" become one word.
   - Guard spec: no `Badge` with an enum `label()` outside `EnumBadge`.
5. **Detail pages and forms.**
   - `RecordPage` columns by the content's width (container queries), and side-column key/value
     grids that drop to one column when narrow (emails truncate with a copy button).
   - `RecordPage` actions rule (destructive tint, order, overflow menu).
   - Cap related lists at 10.
   - Facts first on phones.
   - `StatTile` stacked on all detail pages.
   - `RecordForm` width, grid and sticky bar.
   - `DocumentSheet` for the invoice, work order and energy report.
   - `InlineFormCard`.
   - One `EmptyState`.
6. **Module pages.**
   - Every settings page onto `ModuleSettingsPage` at one width, with one title pattern and the
     link as a header action.
   - Schedule: one fixed control row in every view, the legend in every view.
   - Trim the dashboards: the explainer cards (docks, condition, energy) leave the working pages
     (decision D); the energy site's alerts list becomes a link with a count; cap the schedule
     backlog. Drop the energy simulation controls from production pages (demo only).
   - `KpiTile` becomes `StatTile`.
   - Chart and illustration colours to `--chart-*` and the state tokens.
   - Guard: extend `state-colours.spec.ts` by shrinking its allow-list.
7. **Shell, dashboard and portals.**
   - Shell:
     - Top bar: bell and feedback; language, theme and colour mode move to the user menu; the
       theme picker only in dev or for owners.
     - Sidebar grouped by task, with a visible scrollbar (drop `no-scrollbar`); fewer groups also
       makes it fit.
     - The order count as a pill.
     - Error pages.
     - Settings sub-pages hidden from those who can't open them.
   - Dashboard, rebuilt as the planner's **"needs attention today"** view (see the table). Design
     it first: prototype two or three options against journey (a) in the discovery, before
     building.
     - One list across all customers, with sections: to accept, critical, due, waiting for a
       part. Overdue on top.
     - Plan from the row: accept, assign, reserve the part.
     - It keeps its place through interruptions.
     - Counts as a few equal tiles that filter the list, 2-up on phones.
     - Partner bonus, wallet, revenue and charts move off it (to their modules or reports).
   - Portals:
     - `PageHeader` with `back` (from step 2).
     - `OrderCard` from `WorkCard` for the portal lists.
     - Customer portal bottom nav, or a persistent "Report a breakdown".
     - Engineer buttons `lg` and a sticky "Complete job".
     - `WalletSummary`.

Then, as its own piece: **cards on phones for the engineer's and customer's lists** (finding 10,
decision C), built on `OrderCard`. The office lists stay tables.

The bugs in "Bugs seen on the way" are separate small fixes.

## Decisions (settled by the UX discovery, section 7)

- **A. Hero banners: none.** The owner calls the big banner headers "demo only". `PageHeader`
  everywhere.
- **B. The coloured bar before card titles: dropped.** Colour is for status and action only.
- **C. Lists as cards on phones: yes for the engineer and the customer.** The planner works at a
  desk, so the office lists stay dense tables, tuned for width.
- **D. Explainer content on module dashboards: off the working pages.** It was pitch material. If
  a module needs an explanation, it goes to its settings page or the docs.
