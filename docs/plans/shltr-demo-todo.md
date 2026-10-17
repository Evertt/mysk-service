# SHLTR on staging: what's left before the client says "yes"

The aim: send the client the staging link (https://fieldworks-staging.devign.workers.dev) and have
him recognise what he meant. That doesn't mean copying his pages exactly. It means building the
system the way he most likely intended it, and giving it the vibe of his mockup: the banners, the
illustrations, the animations. Where the real thing needs a connector we don't have yet (Salvo,
P1), a simulation shows what it will look like.

Numbers (#n) are the deviations in [shltr-deviations.md](shltr-deviations.md).

## The deviations this starts from

34 deviations: every _changed_ one with high impact, every _left out_ one with medium impact and
an unknown reason, and everything _not yet_ built.

**Changed, high impact (18):**

- Shell: #4 Werkbonnen became Checklists (templates), #5 Partner Bonus only in the portal, #6 the
  one shell split into three.
- Dashboard: #31 the bonus card is an overview of all partners, #32 no Wallet panel.
- Apparatuur: #61 "Staat" became two statuses.
- Connect: #99 units instead of components, #103 the condition score is entered, not computed, #105
  the status rules.
- Werkbonnen: #124 no Werkbonnen page, #128 no "Keuring 2026" start button, #133 only the
  engineer fills it in, on the portal.
- Docks: #150 a Salvo feed instead of static data.
- Energie: #175 stored readings instead of the in-page simulation, #195 alerts become orders, not a
  Focus AI batch.
- Shop and bonus: #203 the shop is in the customer portal, #225 so is the bonus page, #231 the
  figures come from the app's own invoices.

**Left out, medium impact, reason unknown (5):**

- #19 global search, #20 the notification bell, #37 the dashboard's "Snel naar", #65 refresh and
  export on the equipment list, #158 the dock illustration.

**Not yet (11):**

- Planning: #54 expired inspections get no priority, #55 preferred day and time slot not used.
- Apparatuur: #74 no import of the client's register.
- Klantkaart: #81 the order types chart, #82 the building facts, #83 the documents.
- Docks: #151 the real Salvo link, #173 docks in the customer portal.
- Energie: #177 the real P1 link.
- Shop: #224 prices per customer, delivery, on-request handling.
- Partner Bonus: #247 returns after the award, exclusions, suspension for overdue invoices.

## The work, in order of what it does for the client's reaction

**In progress:** components under each unit, with their articles, and the condition score computed
from the checklist (#99, #103, #105), on branch `condition-components`.

### 1. A living demo: Salvo and P1 simulated on staging

**Energy: done** (branch `energy-live-demo`): the seam's `simulation.run` makes Riedel's P1 meters
and door sensors up through the module's own ingest, every 15-minute interval since the latest
reading (no zone goes offline but the mockup's external unit), surges over thresholds and doors
left open too long now and then, livelier at a higher speed; the "P1 simulatie" bar on the site
page, and "simulatie N× / gepauzeerd" in its banner. Docks: in progress (`docks-live-demo`).

#150, #151, #175, #177. Staging's dock board and energy pages go stale, because the simulators are
scripts someone has to run (`pnpm docks:simulate`, the energy simulator): zones show "Offline", and
no dock turns amber or red.

- Run both simulators inside the Worker for the demo organization: a Cron Trigger (or the Durable
  Object's alarm) every minute posts Salvo events and P1 readings through the same ingest
  endpoints a real gateway would use. So when the real connectors come, only the source changes.
- A simulation bar on the dock board and the energy page, like the mockup's, shown only for a demo
  organization: play/pause, speed (1×–30×), reset, and a badge "Simulatie". The scenarios should
  show every state: a dock past 40 and 60 minutes, an SCP fault, a zone over its threshold, a cold
  store door left open.
- Effort: medium.

**Docks: done** (branch `docks-live-demo`). A core seam, `simulation.run`
(`src/lib/simulation/extensions.ts`, the runner `src/lib/server/simulation.ts`, the `simulation`
table): a module contributes `{ tick, reset }`, ticked over each interval of real time by
`POST /_ops/tick`, the Worker's minute cron and the `<SimulationBar>` (every 5 s while the page is
open). The docks' scenario (`src/modules/docks/server/scenario.ts`) goes through the feed's own
path, so the board, the 40/60-minute rules, the breakdown orders (one open per door) and the
sessions work as with Salvo; a reset (and the seed) puts DOCK 05–08 in the mockup's states
(Laden 23:40, Bezet 44:40 amber, Vrij, Storing 1:27:20 red) without making a notice or an order.
The board's badge reads "Simulatie". **Energy: still to do**, on the same seam (its row is seeded).

### 2. The mockup's illustrations and animations

**Energy: done** (branch `energy-live-demo`): the banner, KPI tiles with icon and change, the floor
plan (floors stacked, Expeditie & Docks full width, tone-bordered zones with a pulsing dot, the
legend), selecting a floor or zone on the page with a detail panel and "Signalering", the live
meter's flowing bar and estimated solar generation, door cards with the rising panel, leak bars,
snowflake and truck, and the chart with "Nog te meten"; all state-driven, still with reduced
motion. Docks: in progress.

#158, and the vibe deviations outside the filter: #185, #187, #186 (energy), #163–#164 (docks).

- Dock cards with the drawn dock: a sectional door that opens and closes, a three-lamp beacon, the
  truck driving in and out, the Wheel-Lok indicator blinking, all driven by the live state.
- Energy: the building as a floor plan (floors stacked, Expeditie & Docks full width), zones as
  coloured blocks with a pulsing dot; door cards with the animated door, leak bars and the
  snowflake for cold stores; the main meter's live bar.
- Respect `prefers-reduced-motion`.
- Effort: medium.

**Docks: done** (#158, #159, #163–#165, #167). The board after the mockup: the teal banner
(`<PageBanner>`, generic, `src/lib/components/page-banner.svelte`), the KPI row (`<StatTile>`),
big cards two a row with the drawn dock (`src/modules/docks/board/dock-drawing.svelte`: the door
rises and lowers, the three-lamp beacon, the truck with its plate driving in and out, the blinking
Wheel-Lok, the SALVO tag), the tiles, the Salvo Safety System block and the details; timers in
mm:ss below an hour; the process, signals and components cards. Still different: a free dock has
no planned time slot (#160, no dock planning), the remark is generated (#162). **Energy: still to
do.**

### 3. The mockup's look on every page

#92, #93, #26, #29, #30, #226, #179. The Lagoon theme copies the colours. The page compositions
weren't built:

- Shared components: the teal gradient page banner (Connect, Docks, Energie, Werkbonnen, Partner
  Bonus), the teal toolbar band (Planning, Apparatuur), stat tiles with a coloured icon and a
  trend line, key-figure tiles with the teal left border, the dark Wallet panel, filter chips
  with counts, and call-out notices.
- Put them on the pages the mockup has them on.
- Effort: medium, then small per page.

**Done** (branch `mockup-look`). The pieces are in `src/lib/components/` (see
[shltr-style.md](shltr-style.md), "The shared components"), and on these pages:

- Dashboard: "Goedemorgen / Goedemiddag / Goedenavond, {voornaam}" and "Hier is wat er vandaag
  speelt."; every tile (the modules' too) a stacked `StatTile` with a coloured icon. Two tiles
  have a trend against the period before, from real data: Open opdrachten ("N nieuw in de laatste
  7 dagen (+3)", the orders made against the 7 days before) and Omzet, laatste 30 dagen ("+18%
  t.o.v. de 30 dagen ervoor"). The others are a state now (spoed, te accepteren, apparatuur met
  aandacht, lage voorraad, alerts, shopbestellingen): nothing records what they were a week ago,
  so they have none.
- Planning and Apparatuur: the toolbar band (icon, title, a pill with the orders planned or the
  units listed, previous / next / today and the white-on-teal Maand / Week / Dag); Apparatuur's
  band has the "SOORT" chips with counts under it, which set the category filter (the faceted
  filters stay).
- Connect: the teal banner ("Connect", "Onderdelenbeheer per klant" and the mockup's intro, without
  the SHLTR brand, as modules carry none), the four process cards (step 3 says what's built: the
  interval plans the next visit, critical components are planned by hand; expired inspections get
  no priority yet, #54), the KPI tiles with icons and the customer chips.
- Partner Bonus (portal): the banner ("{organisatie} · Partnerprogramma", "Samen groeien. Meer
  voordeel."), the key-figure tiles, the expected cash and credit, the dark Wallet panel (also on
  the portal's home and the office's partner card), and the programme in the mockup's four tabs.
  No "Shop met Parts Credit" in the banner: the shop's button is the wallet's (a module's slot).
- Shop (portal): the wallet card ("SHLTR Wallet · beschikbaar Parts Credit", the amount, "Geldig
  t/m", "Bekijk programma") and the amber low-stock call-out.
- Klantkaart: the four key figures as tiles with an icon, the figure on the right.

### 4. All three sides one click away on staging

#5, #6, #31, #32, #203, #225. The client's files confirm the shop, the bonus and the wallet are the
customer's (decision A). On staging, though, he'd sign in as the office and never see them.

- On a demo organization, the sign-in page offers "Kantoor", "Monteur" and "Klant (Riedel)".
- Office users get a "Bekijk als klant" switch that opens the portal as one of a customer's
  contacts, read-only. Engineers get the same for the engineer portal.
- Effort: small to medium (it must not become a way around the tenancy gates).

### 5. A Werkbonnen page in the office

#4, #124, #128, #133. Checklists stay one per unit per order: that's how the work really runs, and
My24Service agrees. But the office should have the mockup's view.

- A "Werkbonnen" page: every unit with its checklists by year ("2026 ✓" / "2026 open"), search by
  unit or component, and the checklist with its history beside it.
- "Keuring 2026" and "Onderhoud 2026" buttons that make an inspection or maintenance order for that
  unit, ready to plan.
- The office can complete a checklist on the engineer's behalf (for paper forms brought back).
- The sidebar item becomes "Werkbonnen"; templates move into its settings.
- Effort: medium.

### 6. Critical components plan themselves

#54, #55, and §1.3 of the deviations. The Connect presentation: Kritiek → "Binnen 5 werkdagen
inplannen, onderdeel direct reserveren"; "Kritieke en geplande onderdelen vullen automatisch de
agenda."

- Automatic planning on by default for SHLTR. The order carries the component's article as a
  material line, which reserves its stock.
- Gepland means scheduled, with an engineer and the parts reserved.
- The planning's backlog puts expired inspections and critical components first. Its plan dialog
  proposes the site's preferred day and time slot.
- #61: the equipment list's status column shows the Connect status (Kritiek / Aandacht / Gepland /
  In orde) when the module is on.
- Effort: medium.

### 7. The notification bell and global search

#20, #19. The platform video is full of notifications.

- A bell with what needs someone, live: orders reported in the portal, energy alerts, docks past 40
  and 60 minutes, components turning critical, shop orders to confirm. Each one links to its page
  and can be marked read.
- The header search ("Zoeken…") finds customers, units, components, orders and shop products as
  you type.
- Effort: medium.

### 8. The dashboard and the Klantkaart as the mockup has them

#37, #81, #82, #173, and #26–#30.

- Dashboard: "Goedemorgen, Jan", KPI tiles with an icon and a trend against the previous period,
  and "Snel naar" (the shop's stock, the last opened customer, what's due today).
- Klantkaart: the order types donut, the building facts per site (floor area, parking spaces,
  workplaces), the four key figures as tiles.
- Customer portal: the customer's own docks, read-only, as energy already has.
- Effort: small to medium.

### 9. His names and his programme

§1.4, §1.6 and §1.7 of the deviations. He wrote the brochure, so he'll read every number.

- A product name per organization for the app and its portal: "SHLTR Connect".
- Partner Bonus as brochure v10 has it: the four revenue categories that all count, its worked
  example (€ 200.000 → € 7.600 or € 9.600), and its 15 conditions word for word.
- The cash-bonus credit note warns while the partner has overdue invoices.
- Effort: small.

## Later, or once the client answers

- #83 documents, which needs file storage (R2): a large job, and his presentation gives it a
  chapter of its own, so it comes next after this list.
- #74 importing his register and order history from My24Service: needs access to his data.
- #151, #177 the real Salvo and P1 links: need their APIs (questions in shltr-deviations.md §5).
- #224 shop prices per customer and fulfilment, #247 the programme's finer rules, #65 export, #195
  bundling alerts: open questions, or of little visible value.
