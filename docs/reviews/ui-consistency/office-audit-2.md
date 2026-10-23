## Audit complete — office app

I've covered ~35 office routes at 1600px and at the shell's 1038px window: dashboard, all core lists, planning week/month/day, work orders master–detail, condition, docks, maintenance, energy, invoices + credit notes, contracts, partner programme, shop orders + shop items, order/customer/equipment/contract/engineer/material details, the create forms, and the module settings pages. Manager-only `/settings/order-types` still returns "Geen toegang" for the planner, so those pages are the one blind spot.

No source files were changed. Here is what's inconsistent, then the plan.

---

## The inconsistencies

### 1. Page chrome — four systems, three type scales

| Chrome        | Used by                                      | Title       | Description       |
| ------------- | -------------------------------------------- | ----------- | ----------------- |
| `PageHeader`  | 43 pages                                     | 24px        | 16px              |
| `PageBanner`  | condition, docks, checklists, partner portal | 24px, white | 14px, 90% opacity |
| `ToolbarBand` | equipment, planning                          | **20px**    | 14px              |
| Custom        | dashboard greeting, engineer portal          | varies      | varies            |

- The same page title is 24px on most pages and 20px on Apparatuur/Planning; descriptions change size and colour between header, banner and band.
- `/checklists` has no title outside the banner. `/docks` and `/condition` have white-on-teal titles, so those pages look like a different product.
- **Settings entry points are in three places:** in the header actions (`/invoices`), as a button _under the title on the left_ (`/maintenance`, `/energy`, `/partner-programme`, `/parts-shop/products`), and inside the banner (`/condition`, `/docks`).
- Banner actions wrap differently: one button inline on docks/checklists, two buttons stacked on condition.
- Band controls wrap per view: planning's view switch is beside the arrows in month, below them in week, and alone on a third row in day.
- `/maintenance` and `/energy` repeat the section name in breadcrumb + title ("Onderhoudsplannen > Onderhoudsinstellingen"); contract detail's subtitle repeats the level ("Servicecontract Standaard voor …").

### 2. Forms look half-disabled

- The theme gives text inputs, textareas and input groups a grey fill (`bg-muted/60`) and **no border**, while selects are white (`bg-card`) with a border and shadow. Side by side — "Naam" next to "Segment", "Postcode" next to "Plaats" — the text fields read as disabled. This is in `lagoon.ts`, so it applies to every form.
- Date fields show native `dd/mm/yyyy` while every other date is "1 dec 2026".
- Helper text sits in the grid cell and pushes the next row of the opposite column out of alignment (`/equipment/new`: "Fabrikant" vs "Model").
- The invoice form's "Wat je factureert" card is a blank card until a customer is chosen, with no empty-state explanation.
- A form page's primary action lives only in the bottom bar, so the header looks empty — acceptable if every form does it, but there is no shared form shell enforcing it.

### 3. Lists and toolbars — four filter models

- **Standard:** search + Filter menu + active pills + saved views + view options (`/orders`, `/customers`, `/materials`, `/contracts`, `/invoices`, `/credit-notes`).
- **Bespoke filter card:** `/activity` — a card with selects, two date inputs and "Filteren"/"Wissen". No search, no pills, no saved views.
- **Chip + card table:** `/parts-shop` — "Open/Alle" chips and a table in a card, no search or toolbar; `/parts-shop/products` — a card table with no toolbar at all.
- **Master–detail triple filter:** `/checklists` — search + customer select + four count chips + "506 assets".
- **Duplicate facet:** `/equipment` shows category chips in the band _and_ Categorie in the Filter menu.
- **Overflow:** `/maintenance` adds a visible "Te laat en de komende 30 dagen" select that makes the whole content area 886px wide in a 782px column — the page itself scrolls horizontally and "Weergave" is clipped. The toolbar is `sm:flex-nowrap` with `shrink-0` controls, so extra tools always overflow.
- **Table clipping:** wide tables scroll inside a 732px pane (orders need 1430px) with a hidden scrollbar and no edge cue, so columns look amputated (`Segment`, `Reden`, status badges). The pinned action column cuts the column beneath it mid-badge.
- **Default column budget** is too high: 8–9 columns are shown before the user opens Weergave.
- `/checklists/settings` is a clean card table but has no actions at all.

### 4. Detail pages — the side column is too narrow

- `RecordPage` uses `lg:grid-cols-3`; the side column lands at **229–245px**. Its two-column label/value grids then give each column ~97px, producing "Ambachtswe g 74", "facilita…" clipping, and "AangemaaktGepland" in the planning card.
- The invoice "Toevoegen aan de factuur" card is 229px wide with 242px of content, so the price is cut off.
- The activity card on `/engineers/[id]` and `/materials/[sku]` is visibly broken: the teal title bar floats above the title, "Alles bekijken" sits above it, and the description wraps into four words per line.
- The checklist asset panel header is crushed: the asset title collapses into a ~50px column and the "Keuring 2026" button overlaps it.
- Detail action rows vary from 2 to 4 buttons, often with no primary action (`/materials/[sku]` has four outline/destructive buttons).
- Long emails are `truncate` with no copy/tooltip; other places `wrap-break-word` breaks them mid-word. Same data, three behaviours.

### 5. Key figures — five layouts across six pages

`StatTile` offers `inline`, `stacked`, `row`, `card` and `figure`. In practice:

- dashboard: `stacked`, big number, icon top-left;
- customer: `row`, coloured number right-aligned;
- equipment/order/materials: `figure`/`card`, huge black numbers with optional pill and legend;
- engineers: plain label + number with no icon or card;
- docks/energy/condition: `inline`, number with a coloured left bar;
- condition adds "Bekijken" buttons to two of three tiles and none to the first.

Number colours are semantic in some places (revenue green, alerts red) and arbitrary in others (teal vs amber). Tiles in the same row don't share height when one has a footer note.

### 6. Badges — no vocabulary

- Statuses: tone badges (Ingepland teal, In behandeling amber, Kritiek red), plus the _engineers table_ where status is an inline dropdown badge.
- Classifications: blue outline badges with icons (segment, specialty, level), neutral outline without icons (categories in checklists settings), decorated with a different icon per value (shield/circle/award for contract levels).
- Partner levels: solid PLATINUM/BRONZE chips — the only solid badges in the app.
- One concept changes treatment between list and detail: "Werktuigbouw" is blue-with-icon in the engineers table, neutral-with-icon on the engineer page.
- Table cells mix badges and numbers: materials "Voorraad" puts a warning badge and "0 st." in the same right-aligned column.

### 7. Module landings are each a different composition

- `/condition`: banner + 2×2 educational cards + collapsible legend + 3 tiles + list. The list starts below the fold. This pattern exists nowhere else.
- `/docks`: banner + simulation card + 5 tiles + dock cards with a large CSS truck illustration. The illustration exists nowhere else.
- `/checklists`: banner + master–detail; the right pane is an empty dashed box until you pick an asset.
- `/energy`: header + one 1/3-width card in a sea of white; no search, no list, no CTA.
- `/partner-programme` (office): header + "Programmajaren" under the title + a table with a progress bar inside a cell.
- `/parts-shop`: header + chips + a card table.
- Nested cards inside cards appear on settings and on the dashboard's "Onderhoudsplannen"; nowhere else.

### 8. Settings — four layouts and four naming schemes

- Read-only definitions: `/invoices/settings`, `/maintenance/settings`, `/condition/settings` — a borderless card with a bare sentence "Alleen eigenaren en beheerders…" and 3-column label/value rows.
- Tables: `/docks/settings`, `/energy/settings` — standard card with title bar.
- Nested module cards: `/settings`.
- Titles: "Facturatie-instellingen", "Instellingen onderdelenbeheer", "Salvo-koppeling", "Energie-instellingen", "Onderhoudsinstellingen".
- `/energy/settings` "Locaties en codes" clips the Deuren column because the comma-separated zone list has no wrapping.

### 9. Empty and error states — three patterns, too many buttons

- 404/403: icon + title + description + **three** buttons ("Opnieuw laden", "Terug", "Terug naar het dashboard"); "Terug" and "Terug naar het dashboard" do the same job.
- Empty list: dashed `Empty.Root`, title + description, no action.
- Checklist picker: the same `Empty.Root` but no icon and a different size.
- Activity card: centred title + text, no icon.
- Engineer 404s leak keys: "Opdracht equipment niet gevonden", "Opdracht locations niet gevonden" (portal, but a sign the pattern spreads).

### 10. Shell and navigation

- The sidebar nav is **clipped with no scroll affordance**: at an 804px-tall window the nav is 812px tall inside a 676px scroller with `no-scrollbar`. "Energie", "Facturatie" and "Partnerprogramma" are below the fold; a planner sees only "Servicecontracten" under MODULES.
- Two dropdowns can be open at once: "Opgeslagen weergaven" and "Weergave" overlap, and one obscures the other's first items.
- `/maintenance` makes the whole main area horizontally scrollable (886 vs 782), so the header pans with the content.
- Month view shows the order-type legend; week and day don't. Month chips truncate to "08:30 Rie…".
- Hidden scrollbars throughout (sidebar, tables) remove all "there is more here" signals.

### 11. Dashboard

- Custom greeting heading instead of the page header, so its title scale/position differs from every other page.
- Chart palette is saturated blue/purple/amber/green/teal against a teal brand.
- "View all" links are inconsistent: "Alle opdrachten", "Alle contracten", "Alle facturen", "Alles bekijken", "Bekijken", "Alle activiteit", "Alle partners".
- Masonry leaves large vertical holes; nested cards in "Onderhoudsplannen".
- Tiles use `stacked`, unlike every page-level KPI row.
