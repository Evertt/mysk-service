# SHLTR mockup: the style, and the Lagoon theme

The client's Lovable mockup (https://mockup-magic-56.lovable.app, "SHLTR Installation Suite") is a
stock shadcn/Tailwind app whose pages are styled with Tailwind's `slate` and `teal` palettes
directly, not through shadcn's variables (its `:root` still has shadcn's default slate theme). So
its look is in the classes it uses most, which this note reads off the dashboard, Planning, Connect,
Dock, Energie, Apparatuur, Werkbonnen, Onderdelen Shop and Partner Bonus pages.

The theme that copies it is `src/lib/themes/lagoon.ts` ("Lagoon"), with no changes to
`src/lib/components/ui`.

## What makes the look

|               | Mockup                                                                                                                                                                               | Lagoon                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page          | `#f6f7f9` behind white surfaces                                                                                                                                                      | `--background` the same grey, cards, header and sidebar white                                                                                                                                                                                               |
| Brand         | teal: `teal-600` buttons, `teal-500` logo tile, progress bars and banners, `teal-50`/`teal-700` for the active nav item and selections                                               | `--primary` teal-600, `--sidebar-primary` teal-500, `--accent` teal-50 with teal-700 text                                                                                                                                                                   |
| Neutrals      | slate: `slate-900` headings, `slate-500`/`slate-600` body and labels, `slate-400` hints, `slate-200` borders, `slate-50`/`slate-100` fills                                           | the same slate steps in `--foreground`, `--muted-foreground`, `--border`, `--muted`, `--secondary`                                                                                                                                                          |
| Corners       | `rounded-md` (8px) almost everywhere: cards, buttons, inputs, nav items, tiles; `rounded` (4px) status badges; `rounded-full` pills, chips and progress bars                         | `--radius` 0.625rem (so `rounded-md` is 8px), cards and tables `rounded-md`, badges 4px                                                                                                                                                                     |
| Depth         | flat: 1px `slate-200` borders, no shadows except a `shadow-sm` on buttons                                                                                                            | cards and tables lose their shadow and get a `--border` ring; buttons keep `shadow-sm`                                                                                                                                                                      |
| Type          | the system UI font, small: `text-sm` body, `text-xs` labels, `text-[11px]` badges and hints, `font-semibold` titles and numbers, `tabular-nums`                                      | `--font-body` is the system stack; card titles semibold, card descriptions `text-xs`, badges 11px                                                                                                                                                           |
| Section cards | a header band (`border-b`, `px-5 py-3`) with a teal `\|` before a `text-sm font-semibold` title, then the content                                                                    | a card with a header and content gets the band, the border and a teal bar before its title (`card`, `card-header`, `card-title`)                                                                                                                            |
| Tables        | `bg-slate-50` head row with `text-xs font-medium text-slate-500` (not uppercase), `slate-100` row lines, `slate-50` hover                                                            | `table-header`, `table-head`, `table-row` likewise                                                                                                                                                                                                          |
| Status badges | tinted per meaning: `bg-X-50 text-X-700 border-X-200` with sky (new, planned), amber (in progress, attention), emerald (accepted, done, fine), indigo (sent), rose (fault, critical) | statuses take a tone (`success` emerald, `warning` amber, `info` sky, `danger` rose, `neutral` slate) from their `display.ts`; the other badges keep a tint per variant: `default` teal, `secondary` sky, `outline` white, `destructive` rose, `ghost` grey |
| Inputs        | `bg-slate-50`, `slate-200` border, white with a teal border on focus                                                                                                                 | `input`, `input-group`, `textarea` likewise, plus a faint teal ring for keyboard focus                                                                                                                                                                      |
| Sidebar       | white, flat list, `px-3 py-2 gap-3` items, `slate-600` text, `slate-50` hover, teal-50/teal-700 active                                                                               | `sidebar-menu-button` taller and roomier, active in the accent; group labels small caps in muted grey                                                                                                                                                       |
| Charts        | teal for single series; sky, indigo, amber, emerald for kinds and statuses                                                                                                           | `--chart-1`…`--chart-5` sky, indigo, amber, emerald, dark teal (the order statuses quote → invoiced), revenue in `--primary`                                                                                                                                |

Dark mode: the mockup has none worth the name (its `.dark` variables are shadcn's, and its pages
hardcode light slate). Lagoon's dark mode follows the one dark surface it does have, the SHLTR
Wallet panel: `slate-950` page, a slightly lighter slate for cards and sidebar, teal-500 for the
brand and translucent tints for the badges.

## What to ignore

- Exact icons and icon details (sort arrows on table headers, the trending-up glyph on stat tiles,
  Lucide icon choices): ours are fine.
- The mockup's spacing inside dense tables (`px-5 py-3` cells): our data tables carry more columns
  and keep their own density.
- Illustrations and gimmicks: the CSS truck/dock drawing on Dock, the door drawings on Energie, the
  P1 simulation controls, the "Edit with Lovable" badge.
- Copy, numbers and names: they're mock data (see `shltr-domain.md` for what they tell us).
- The shadcn defaults the mockup leaves untouched (its tabs and outline buttons): ours already match.

## What a theme can't do

These recur across the mockup's pages but are page composition, not component styling. They're
worth building as small shared components when the pages that need them are built:

- **Page banner.** Connect, Dock, Energie and Werkbonnen open with a teal gradient banner (`from-teal-600
to-teal-500`, white text, uppercase pills like `SALVO SYSTEEM · LIVE`) holding the title and a
  sentence on what the page does.
- **Coloured card header.** Planning and Apparatuur put their toolbar (title, count pill, search,
  segmented Month/Week/Day control, buttons in white-on-teal) in a solid teal band on top of the card.
- **Stat tiles with an icon.** The dashboard and Connect tiles: a teal (or status-coloured) icon top
  left, the number in `text-2xl font-semibold`, a `text-xs` label and an 11px trend line.
- **Key figure tiles.** A `bg-slate-50` block with a `border-l-2 border-teal-500` (Partner Level,
  Partner Omzet, Bonus Omzet).
- **Dark panel.** The SHLTR Wallet: a `slate-950` side panel with white type and a teal amount and
  button, next to a white panel in one card.
- **Progress bar.** `h-2.5 rounded-full bg-slate-100` with a teal fill (bonus progress, condition
  scores, coloured by status there).
- **Filter chips.** Rounded-full chips with a count, the active one teal-50/teal-300 (Connect,
  Apparatuur) or solid `slate-900` (Energie's zones).
- **Grouped tables.** Apparatuur groups rows under a header row with a tinted badge and an item count.
- **Notices.** Amber (`bg-amber-50/60 border-amber-200`) and teal call-outs for "3 taken vervallen
  vandaag", low stock and wallet balance.
