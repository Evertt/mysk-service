# UX discovery: Fieldworks for SHLTR, and beyond

23 October 2026. The anchor for design decisions: why the product exists, for whom, what they're
trying to get done, and how we'll know it works. The UI plan ([ui-consistency.md](../plans/ui-consistency.md))
and every later design step should be checked against it.

## How this was made, and how far to trust it

The real product owner wasn't interviewed. An agent prepared to **play him**: SHLTR's founder, who
owns the business that uses the product _and_ wants to sell the product to others. It read his own
material in `node_modules/.mockup/presentation-files/`:

- the brand philosophy
- the NL and EN presentations
- the proposals to Riedel Ede and SOLOFY/Salvo
- the Partner Bonus brochure
- the documents on the app's parts

It also skimmed his mockup, and saw none of our plans or code. It was then interviewed with the
questions of the `ux-superpowers` skills (`ux-discover`, `persona-builder`, `jobs-to-be-done`,
`user-journey`, `telemetry-designer`). The only facts from our side were what SHLTR's current
system, My24Service, does.

Every claim carries its basis:

- **[S]** stated in his material, with the source: CO = Connect-onderdelen, EN = EN presentation,
  RIE = Riedel proposal, SOL = SOLOFY proposal, PB = Partner Bonus brochure, PR = NL presentation,
  MF = brand philosophy, My24 = My24Service.
- **[I]** inferred from it.
- **[G]** a guess.

The guesses are collected under "Questions for the real product owner": a short list that's worth
his ten minutes. The role-player's notes, with quotes, are kept outside the repo (session
scratchpad).

## 1. Problem brief

- **Problem.** The status of a customer's doors, docks and levellers is scattered across Excel
  lists, PDFs, heads and suppliers, so inspections slip, repairs are reactive, and parts are sold
  only when something breaks. The product should give **every unit one live status**, and turn a
  signal into the next step: "van signaal naar planning, onderdeel, werkbon en rapport — met
  dezelfde status voor servicedesk en klant". A signal is a bad condition, an expired inspection
  or a breakdown. [S: CO p5]
- **Commercial half.** Move from selling once to lasting customer value: per-asset subscriptions,
  parts linked to findings, and a Partner Bonus wallet that keeps customers buying. [S: EN p22, RIE
  p12, PB]
- **Who feels it.**
  - **SHLTR's planners and servicedesk:** hardest, every day. [I]
  - **Customers' facility managers:** strongly, in peaks: audits, breakdowns, budget. [S: RIE p2]
  - **The owner:** constantly, as reactive revenue. [S/I: EN p22]
  - **Engineers:** on every job, a missing history and not knowing the part. [I/G]
  - **Manufacturers:** strategically, because they lose sight of their products after delivery.
    [S: EN p22, SOL p2]
- **Current alternatives.** My24Service runs orders, the planning board, QR breakdown reports by
  customers, a planner's acceptance step, and one signed PDF per order. But it has:
  - free-text unit states
  - contracts as "N visits per year"
  - no checklists, conditions, inspections, parts link, bonus or shop

  Around it: Excel, email, WhatsApp and memory. [S: My24; G for the workarounds]

- **Scope.** Not "another work-order app", which is the part it must do well but not what's sold.
  The value is a layer about assets, inspections and commerce, on top of orders and planning.
  SHLTR should run entirely on it: one system, not two. [I: PR p9, EN p21–24]
- **First thing to ship.** The asset register with the checkpoint work order per unit per year:
  - Every unit has a card with its inspection status and condition.
  - The engineer ticks the fixed checklist.
  - The report follows from it.
  - The office plans from "kritiek/aandacht" (critical / needs attention).
  - The customer sees the same status.

  Everything else hangs off this. [I: RIE p9–12, CO p2–5]

- **What it is not.**
  - Not a safety system. [S: EN p23]
  - Not a ledger: "de administratie van SHLTR is leidend". [S: PB p10]
  - Not a CRM, or AI that acts on its own. [S: Focus AI "pas uitvoeren nadat jij akkoord geeft"]
  - Not a building-management platform.
  - Not custom per customer. [I: SOL p4]
- **Two hats.** When SHLTR-the-user and SHLTR-the-seller conflict, **SHLTR's own daily use wins**.
  It's "the proven base" he sells [S: EN p21]. But nothing SHLTR-specific is hard-coded: name,
  bonus percentages and product groups are settings, for a white label ("own logo, own customer
  portal, own webshop, own prices") [S: EN p26].

## 2. Personas

The **primary persona is the planner**: every signal ends on their desk, and if they don't adopt
the product nothing flows. When the planner's speed conflicts with the portal's looks, the planner
wins. [I: CO p3, p5; My24]

### A. The planner (primary)

- **Role and context.** SHLTR office staff who:
  - accept incoming orders
  - plan engineers
  - follow up inspections and parts
  - answer the phone when a dock is stuck

  The dashboard's "Jan". [I]

- **Use.** Opens it at 7:30 and lives in it all day, interrupted by calls. Dutch. [G]
- **Setting.** A desk with two screens and a headset. [G]
- **Sophistication.** Intermediate and a **power user**: fast in a known tool, impatient with
  clicks. [G]
- **Frustrations.**
  - States are free text, so they can't filter "what is critical".
  - Contract visits are counts, so nothing ranks an expired inspection first.
  - Which part fits is in heads or Excel.
  - Orders are accepted one by one with vague descriptions.
  - Results come back as one PDF per order, not per unit.

  [S: My24 for the facts; I/G that they frustrate]

- **Goals.**
  - Functional: nothing slips. Every inspection on time; criticals planned within 5 working days
    with the part ready. [S: CO p3]
  - Emotional: in control, no surprises.
  - Social: the one who called the customer first.
- **Quote.** "Show me what's burning today and let me plan it in one go. Don't make me hunt."

### B. The engineer (monteur)

- **Role and context.** Inspections, maintenance and repairs on doors, docks, levellers, stairs and
  airco at customer sites. 3–6 jobs a day; 5–20 minutes per unit, up to an hour on a breakdown.
  [S: PR p7; G for numbers]
- **Setting.** A phone (today the My24Service app), on a ladder or under a leveller, in a cold
  store at −22 °C, with gloves, noise, and no signal in steel halls. Possibly not a native Dutch
  speaker. [S: My24; G]
- **Sophistication.** Beginner to intermediate. Big buttons, minimal typing. [G]
- **Frustrations.** No checklist, so findings are free text; not knowing which part to bring;
  typing the report afterwards with cold hands. [I/G]
- **Goals.** Finish the unit and leave with it signed; not look clumsy in front of the customer;
  be seen as thorough. [G]
- **Quote.** "Just tell me what to check, let me tick it off, and let me go to the next one."
- **Caveat.** The owner's picture, as their employer; the material barely mentions them. **The
  weakest persona: validate it first.**

### C. The customer's facility manager (e.g. Riedel Ede)

- **Role and context.** Answers for safety inspections, breakdowns and costs (energy included) at
  one or more sites. [S: RIE p2]
- **Use.** An **occasional visitor**: a few times a month, around a breakdown, an audit or a
  budget meeting. The proposal says "dagelijks" (daily); weekly is more realistic. [S: RIE p11; G]
- **Setting.** An office PC, or a phone on the shop floor; reports breakdowns by the QR code on the
  unit. [S: My24]
- **Sophistication.** Must understand the status "in één oogopslag" (at a glance). [S: CO p2]
- **Frustrations.** Data, inspections and reports are scattered across suppliers; energy shows up
  only on the invoice; proving compliance to an auditor takes days. [S: RIE p2; I]
- **Goals.**
  - Functional: one register, everything inspected, fast repairs.
  - Emotional: safe and covered.
  - Social: in control in front of the director or an inspector, with a clean PDF "voor overleg
    en rapportage" (for meetings and reporting). [S: RIE p8]
- **Quote.** "I want to open it and see: everything green, or what you're already doing about it."

### Deliberately secondary

| Who                                            | Minimum need                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer's purchasing / partner contact        | Partner level, progress and Wallet, read-only and honest; order parts with Parts Credit; never an "expected" amount shown as spendable. [S: PB p6, p10] |
| Dock planner / driver at the customer          | Live dock status and escalation (Salvo); a later phase. [S: EN p14–17]                                                                                  |
| Manufacturer's account manager (Salvo/Castell) | Their branding; their connected assets, service and parts requests, recurring revenue. Not their own workflows. [S: SOL p18, p26]                       |
| SHLTR management                               | KPIs: connected assets, MRR, overdue inspections, parts sold. [S: SOL p18]                                                                              |
| Energy users                                   | The energy module as it is; it doesn't shape the core. [I]                                                                                              |

## 3. Jobs to be done

| #   | Persona          | When… I want to… so I can…                                                                                                                                                                         | Imp. | Served |   Gap |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | -----: | ----: |
| P1  | Planner          | When I start my day or an alert comes in, I want to see every unit that's critical or overdue across all customers, so I can plan it before the customer notices.                                  |    9 |      3 | **6** |
| P2  | Planner          | When a breakdown or critical finding comes in, I want to accept it, create the order with the right units, assign the engineer and reserve the part in one flow, so I get a first-time fix.        |    9 |      6 |     3 |
| P3  | Planner          | When a period starts, I want the year's inspections and contract visits per unit laid out, so I can fill the agenda without counting by hand.                                                      |    8 |      3 |     5 |
| P4  | Planner          | When an engineer finishes, I want the checklist results to update condition, inspection date and status, and the report to reach the customer, so I can stop chasing paperwork.                    |    8 |      4 |     4 |
| P5  | Planner          | When a finding says a part is worn, I want the matching article offered or quoted to the customer, so I can sell the repair instead of waiting for the breakdown.                                  |    7 |      1 | **6** |
| E1  | Engineer         | When I stand at a unit, I want its fixed checklist and history on my phone, so I can tick it off, record findings with a photo, get a signature and move on, with no typing in the van afterwards. |    8 |      3 |     5 |
| C1  | Facility manager | When an audit, breakdown or budget meeting comes up, I want all my units with status and reports, so I can show we're safe and compliant.                                                          |    8 |      3 |     5 |

Scores are the owner's judgement [I/G].

**The biggest gaps are P1 and P5.** P1 is the foundation, but it is only as good as E1's data. P5
matters most commercially, but it's worthless if the status isn't trusted. **The order is: E1 + per-unit
status → P1 → P5.**

Emotional and social jobs:

| Job | Emotional          | Social       |
| --- | ------------------ | ------------ |
| P1  | In control         | Proactive    |
| P2  | Relieved           | Fast         |
| P3  | Calm               | Thorough     |
| P4  | Finished           | Professional |
| P5  | Helpful, not pushy | An adviser   |
| E1  | Not clumsy         | Reliable     |
| C1  | Safe               | In control   |

**What they hire today.**

| Who              | Today                                             | Strengths                                                                                     | Weaknesses                                                 | Switching cost                                                    |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Planner          | My24Service, plus Excel, email, phone and memory  | Orders, the planning board, signatures and QR reporting all work, and customers are onboarded | Free-text states, no checklists, no ranking, no part links | High: customers, QR codes, the app and history all live there     |
| Engineer         | My24Service app, paper or memory, WhatsApp photos | Familiar; signing works                                                                       | Free text, no checklist                                    | The new tool must be at least as fast                             |
| Facility manager | Supplier PDFs, Excel, email                       | —                                                                                             | Nothing is in one place                                    | Low, if SHLTR fills the data (it does the inventory) [S: RIE p11] |

## 4. Journeys

### (a) The planner's morning, with a breakdown call

| Phase           | Today                                                                                                                                           | Desired                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7:30 Open       | My24Service on one screen, an Excel inspection list on the other; "what's due" lives in Excel and his head (15 min). Neutral, slightly anxious. | **One "needs attention today" view**: orders to accept, critical units (condition <40% or inspection expired) [S: CO p3], inspections and visits due, overdue on top. "That's my day." In control.                                                              |
| Accept          | One by one, free-text "deur sluit niet" (door doesn't close); calls the customer to ask which door and how urgent (10–30 min).                  | Accept with the unit, its history and the likely part already attached; fewer calls.                                                                                                                                                                            |
| Find what's due | Filters Excel, cross-checks "N visits per year" against what's done (30+ min). Frustrated.                                                      | No separate step: it's in the first view.                                                                                                                                                                                                                       |
| Plan            | Drags to engineers; WhatsApps "spring package on the van?", checks stock with the warehouse (≈30 min).                                          | Plans criticals straight from the list; the suggested part shows stock and is **reserved in the same step** [S: CO p3, p5].                                                                                                                                     |
| 9:10 Breakdown  | Amex: dock 6 stuck open, trucks waiting. Drops everything, phones engineers, reshuffles the board, calls back (20–40 min). **Peak stress.**     | The order is already in from the QR scan on that unit, with its last checklist; he sees who's nearest with a free slot and reassigns; the customer sees "gepland, monteur X, ±11:00" (planned, engineer X, around 11:00) **without a callback**. Back in 5 min. |
| Resume          | Lost his place in Excel; one critical unit slips to next week.                                                                                  | **The list kept its place**; ends with zero criticals unplanned.                                                                                                                                                                                                |

Times and feelings are [G]; the My24Service steps are [S].

- **Make-or-break.** The first morning: if the attention list has false criticals or misses one,
  he goes back to Excel for good. **Trust beats features.**
- **Keep:**
  - the acceptance step
  - the planning board
  - customers' QR reporting
- **Edge cases:**
  - **Part not in stock:** shown at reservation, with an alternative or an order date, and the job
    marked "wacht op onderdeel" (waiting for part) so it doesn't look forgotten.
  - **Wrong unit reported:** move the order to the right unit and keep its history.
  - **Two breakdowns at once:** rank by contract, priority and safety (a dock stuck open beats a
    slow door).
  - **Engineer sick:** their jobs return to a pool, and the board shows what to reassign first.
    Customers with a fixed appointment are told.

### (b) The engineer: one inspection with a rejected point

| Phase          | Today                                                                                                                                 | Desired                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arrive         | Opens the order in the app; the unit's history is hard to see (5–10 min).                                                             | **Scans the unit's QR code** (or picks it from the order), and sees the unit card: last inspection, open findings, condition [S: SOL p6].                                            |
| Inspect        | NEN checks from memory or paper; gloves, ladder, cold (20–30 min).                                                                    | The fixed checklist for the unit's type, **one point at a time, big goed / afkeur / n.v.t. (good / rejected / not applicable) buttons**, **fully offline**. [S: RIE p10; I: offline] |
| Rejected point | Cables frayed at the drum, none on the van; a WhatsApp photo to the office and a free-text note. "Hopefully someone follows this up." | One tap: afkeur, a photo and a short note; **the matching part is suggested** and becomes a follow-up for the office [S: PB p7]. Relieved.                                           |
| Sign           | Hunts for the contact; both sign one PDF for the whole order (5–15 min).                                                              | The customer signs once for the visit; the report shows per unit what was checked and rejected; condition, inspection date and status update by themselves [S: CO p2].               |
| Leave          | Phones the office about the part.                                                                                                     | No call needed.                                                                                                                                                                      |

- **Make-or-break.** The checklist at the unit. If it's slower than memory or fails without
  signal, engineers skip it, and P1 has no data. **Speed and offline are prerequisites.**
- **Keep:** the customer signing on the phone, and the PDF the customer gets.
- **Edge cases:**
  - **No signal:** fully offline, including photo and signature (a must).
  - **Unit not in the register, or the wrong unit:** add or correct it on the spot; the office
    confirms.
  - **Contact not there to sign:** sign later or by email.
  - **Part on the van:** fix it now and record the part used.

### (c) The facility manager: a breakdown, and an audit

| Phase    | Today                                                                                                                         | Desired                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaks   | Dock 6 won't close; walks over, scans the QR code (if they remember) or phones. Anxious: trucks waiting, the cold store open. | Scans the QR code: the unit is already identified; two taps: storing (breakdown), a photo, "trucks waiting".                                                                |
| Waits    | **Silence.** Calls again at 10:00. Frustrated. **Peak pain.**                                                                 | **Follows it like a parcel**: received → accepted → planned (engineer, time) → on the way → done, with a notification at each step. Reassured. [I: CO p5 "dezelfde status"] |
| Resolved | The engineer fixes it; they sign; a PDF arrives by mail into a folder. Will it recur? Unknown.                                | The report sits on the unit's card; rejected parts show as "aandacht" with advice and a price to approve [S: EN p24–25].                                                    |
| Audit    | Two weeks of collecting PDFs from email and suppliers into Excel. Anxious, days of work.                                      | Open the site, filter fire doors: all green or "gepland"; **one PDF per site with the history per year**; 10 minutes [S: RIE p9–10]. Safe, competent.                       |

- **Make-or-break.** The first breakdown after go-live: if they report it in the portal and still
  have to phone to learn anything, they never use the portal again.
- **Keep:** the QR code on the unit.
- **Edge cases:**
  - **Wrong unit scanned:** the planner corrects it, and the customer sees the correction.
  - **Several breakdowns:** each is its own report, and the customer marks which one blocks
    operations.
  - **Not SHLTR's unit:** say so politely and offer a quote.
  - **Several sites:** the manager sees all branches; a dock planner sees only their own.

## 5. Success

- **Six months after SHLTR fully runs on it:**
  - Planners have dropped Excel and stopped saying "I'll check and call you back".
  - Every inspection is done on the checklist, and the WhatsApp photos have stopped.
  - Customers report in the portal and stop phoning about status.
  - Riedel renews and adds assets, and audits are no stress.
  - Parts sales come from findings.
  - There's a real reference to show Salvo. [I; S: EN p21, RIE p11–14]
- **North star.** **Connected units with a valid inspection (last 12 months) done on the digital
  checklist.** Each one is:
  - licence revenue [S: RIE p12, €3.50 per asset]
  - proof the engineer used the checklist
  - a status the customer can trust.

  Baseline: 0 (My24Service has no checklists). Target [G]: 80% of contract units within 6 months,
  100% at Riedel. The total number of units is unknown.

- **Guard rails (must not get worse)** [I]:
  - planner time per order
  - engineer time per unit (at most a couple of minutes more)
  - first-time fix
  - breakdown response time
  - status calls and complaints
  - **wrong statuses: a false "in orde" (all clear) on a fire door is a safety and liability
    risk**
  - an unspendable bonus shown as spendable [S: PB p6]
- **Leading indicators** [S: SOL p18; I: the selection]:
  - units registered with a type and checklist
  - visits closed with a completed checklist
  - criticals planned within 5 working days [S: CO p3]
  - breakdowns reported by QR or portal instead of phone
  - customers active monthly
  - rejected points that become part orders or quotes
  - pilots converting to paid
- **Feedback.**
  - The owner sits with the planners in the first weeks, plus a weekly 15-minute "what annoyed
    you" session.
  - The engineers' Monday briefing, plus a few ride-alongs.
  - Direct contact with Riedel and the pilots, and a thumbs up or down on each closed breakdown.
  - The owner decides, with one planner as key user. [G: not organised yet]

Telemetry events weren't specified; the indicators above can be counted from the data the product
already stores (orders, checklists, activity log), without tracking users.

## 6. Insights and design principles

1. **The status is the product.** Every unit's status must be correct, traceable (who, when,
   which checklist and norm) and the same for office and customer. **When in doubt, show
   "unknown", never "in orde".** [I: EN p23, CO p3]
2. **Trust beats features.** The planner's first morning and the customer's first breakdown decide
   adoption; one false critical, or one forced phone call, sends them back to Excel or the phone.
3. **The engineer's checklist is the root of the data.** If it isn't faster than memory, offline,
   with gloves, nothing above it works.
4. **One view for "what needs attention".** The planner's day starts there and returns there. The
   view keeps its place through interruptions.
5. **From signal to next step in one flow:**
   - accept, then plan, then reserve the part
   - afkeur, then the part suggested, then a follow-up
   - a breakdown, then a parcel-like status for the customer
6. **Three audiences, three densities, never mixed on one screen.**
   - **Planner:** dense, calm, keyboard and batch actions.
   - **Engineer:** one thing per screen, big targets, high contrast.
   - **Customer:** spacious, status at a glance, details on demand.

   The mockup's dashboard mixing partner bonus into the office view is the anti-example. [I]

7. **Money is exact.** Expected and awarded are always separate, with dates and conditions; the
   administration is leading. [S: PB p6, p10]
8. **His words, not software words.** Dutch first: keuring, werkbon, afkeur, storing, monteur,
   sectionaaldeur, dockleveller, NEN numbers. English for international partners. [S/I]
9. **"Engineered Clarity".**
   - Calm, precise, like a technical file.
   - **White working surfaces, colour only for status, mint for progress and action**
     ("groen markeert voortgang, waarde en actie").
   - Night blue for authority (brand areas).
   - A refined grotesque that keeps figures and tables "rustig leesbaar" (calmly readable).

   [S: MF] The light teal was Lovable's default, not his brand. [S: MF; I]

10. **Hold the scope.** The core is assets, checklists, status, planning and parts. Energy, docks
    and AI are modules for specific customers, later. The owner knows he gets carried away
    ("hold me to the core"). [I]

## 7. What this settles for the UI plan

How this discovery answers the open points of [ui-consistency.md](../plans/ui-consistency.md):

- **Decision A (hero banners): drop them.** The owner calls the big teal banner headers "demo
  only". `PageHeader` everywhere.
- **The dock and truck drawings and the energy simulation are demo material.** Building energy and
  Salvo docks are real ideas, but modules for specific customers. Keep their illustrations
  contained, and none of it shapes the core design.
- **The theme's colours change direction.** Lagoon's teal comes from Lovable's default, not the
  brand.
  - **Office app:** neutral white working surfaces; status colours; mint (green) for progress and
    the primary action; night blue for brand areas (sidebar or logo).
  - **Customer portal:** carries the brand most strongly, or the white-label tenant's brand.
  - **Engineer view:** high contrast first.

  This is a bigger change to step 1 of the plan than darkening the teal: a theme of its own,
  "SHLTR", made from the brand, rather than Lagoon tuned.

- **Decision B (teal title bar): drop it.** Colour is for status and action only.
- **Decision C (lists as cards on phones): yes for the engineer and the customer.** The planner
  works at a desk, so the office lists can stay dense tables, tuned for width.
- **Decision D (explainers on module dashboards): remove them from the working pages.** They were
  pitch material.
- **The dashboard becomes the planner's "needs attention today" view** (P1), not a showcase of
  tiles. It keeps its place, and partner bonus and wallet leave the office dashboard.
- **Status vocabulary:**
  - the four condition statuses: kritiek, aandacht, gepland, in orde [S: CO p3]
  - "unknown" as a real state
  - normal shown quietly, exceptions in colour, which the plan already wanted
- **Status the same in office and portal:** same words, same colours, same order.

## 8. Assumptions and risks

- **The engineer persona is mostly guesswork.** Offline use, gloves, timings, the photo habit and
  language are unverified. Risk: building a checklist that engineers skip, which starves the whole
  product of data.
- **The planner's day is inferred** from the business and from My24Service, not observed.
- **How often facility managers use the portal** is optimistic in the material ("dagelijks") and
  unknown in practice.
- **Selling to installers like SHLTR** (not only manufacturers) isn't covered by the material.
  Pricing, branding and data separation for peers are open.
- **The numbers are unknown:** units under contract, engineers, planners, customers.
- **Three product names** (Installation Suite, SHLTR Connect, SOLOFY Connect) and the scope drift
  (energy, AI, sales pipeline) are the owner's own tensions.

## 9. Questions for the real product owner

Ten minutes with him would settle the biggest guesses:

1. How many units do you maintain under contract, and with how many planners, engineers and
   customers?
2. What do your engineers use today besides the My24Service app: paper checklists, WhatsApp, their
   memory? Do they work offline in the halls?
3. Can we spend half a day with a planner and ride along with an engineer for one morning?
4. Who at a customer like Riedel actually opens the portal, and how often: the facility manager,
   purchasing, the dock planner?
5. Is the first market for selling the product manufacturers (Salvo/Castell) or installers like
   SHLTR?
6. Is the product's name SHLTR Connect, and is SOLOFY Connect the white label?
7. The brand is night blue, white and mint. Should the office app wear it, or only the customer
   portal?
8. Which mockup elements would you be sad to lose? (Our reading: the condition score, the four
   statuses, the checklist work order, checkpoint-to-part, the Wallet. The banners and drawings
   were for the pitch.)
9. When a checklist point is rejected, should the office or the customer approve the part
   order?
10. What would make you say, three months in, "this was worth it"?

## 10. Next steps

1. Put the questions above to the real product owner, plus the planner visit and the ride-along
   (question 3), if at all possible.
2. Revise [ui-consistency.md](../plans/ui-consistency.md) by section 7: decisions A–D settled, and
   step 1 becomes a brand-based theme.
3. Write the target `DESIGN.md` (or the kit's design section) from the plan's system table and the
   principles in section 6.
4. Design the planner's "needs attention today" view (P1) and the engineer's checklist flow (E1)
   first: they carry the product. Prototype two or three options for each before building.
5. Check each UI step against this document with `ux-validate`.
