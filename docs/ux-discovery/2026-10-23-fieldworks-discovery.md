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

## 0. Version 1: what My24Service changes

A second round, same day: the role-player read the three repositories of My24Service as the
product's **version 1**, the platform SHLTR and its customers have used for years. The new product
is its successor. Sources: `/Users/evert/Sites/My24Service/{my24service,frontend,my24-mobile}`,
including 15 days of production logs (September 2026) and `docs/contract-usage-prod.json`. They
are tagged [S: My24 …]. The sections below are corrected where version 1 contradicted them.

### What version 1 is

- **A multi-tenant field-service SaaS, 14 years old** (first commit 2012-03-29), with a schema per
  tenant.
- **Three clients:** a Vue web app (planners, admins, customers); the Flutter `my24app` for every
  role, engineers included; and `shltr_flutter` (since 2024) for customers' staff and planners.
- **"SHLTR Connect" already exists.** It's the `shltr` product family: its own theme and app,
  served on shltr-connect.com, with 9 tenants.
- **About 24 real tenants.** The heaviest isn't SHLTR but **Rite-Hite**, a dock and door company:
  in 15 days it had 129 orders, 93 signed work orders, 176 material lines and 126 photos. In the
  same period `shltr-installation` had 19 orders and 7 signed work orders. **Selling to other
  companies isn't a future plan; it's the current business.**
- **How SHLTR is set up:**
  - Each SHLTR customer (Riedel, Amex, Poelgeest, Smurfit, …) is a tenant with branches.
  - Their orders are copied to SHLTR's maintenance tenant (10 partners, 187 copied orders).
  - A planner accepts or rejects each order, and the answer goes back to the customer's
    original.
- **What it tracks and does:**
  - **Units:** building → location → unit, each with a QR deep link, documents (split
    Technical/Facility), a serial number, installation date, and a free-text state with "replace
    in N months".
  - **Contracts:** units with visits per year, a tariff and standard hours.
  - **Orders:** an order covers several units (order lines), engineers and dates.
  - **Statuses:** texts each tenant can edit, which trigger email, SMS, push, .ics invites,
    partner copies and reminders.
  - **Planning:** a dispatch board, engineers' GPS, assignment by distance, and a schedule
    customers can see.
- **The engineer app** registers start and end codes, hours and km (travel, extra and unforeseen
  work), materials from a stock location, photos, files, and an extra order from the field. The
  engineer and the customer sign, and that emails the work-order PDF. **It works online only.**
- **Invoices and quotations exist but are hardly used:** 3 invoices and 13 quotations across all
  real tenants.
- **Checklists were specified in 2019 and never built.** They covered fire doors, dock levellers
  and overhead doors: good / fault / n.a. / quote, a sticker, and "order parts for dock no. (photo
  of the old part)", estimated at 84 hours. It's **the oldest unmet need**. [S: My24
  my24service/TODO.md]
- **Customers mostly read.** At Riedel in 15 days: 167 equipment reads, 83 document reads, 58
  schedule views, 3 orders created and 7 QR scans.
- **The mockup partly reskins version 1.** The customer card's floor area, parking and
  workstations, and the Technical/Facility documents come from the existing shltr dashboard. The
  webshop and 3D module were tried as iframes and are switched on for no one.

### Keep, improve, and what the presentations never mentioned

**Keep, some of it exactly:**

- The QR stickers already on site: the same links (link.shltr-group.app) and the same result. Scan,
  see the unit, report a breakdown.
- The customer as its own tenant with branches and branch-scoped users. Orders copied to SHLTR
  with accept/reject.
- One order with several units, engineers and dates. A signed PDF per order, emailed to the
  customer.
- Hours, km, materials (with stock) and photos in the engineer app. Start and end codes. An extra
  order from the field.
- The dispatch board, engineer GPS, and the schedule customers can see.
- Contracts with visits per year per unit. Documents per unit and location.
- Editable status texts with email, SMS, push, .ics and reminders.
- The shltr app's UX rules (`my24-mobile/docs/ux-principles.md`): a stepped order form, land on
  the list, show the photo.

**Improve:**

- Free-text unit state becomes checklist results, a condition score, an inspection date and a
  status.
- The work order describes units in free text; it becomes a result per unit.
- Contracts that only count visits become a schedule of due inspections and visits per unit.
- Customers can't browse their units in the app ("binnenkort", coming soon).
- The engineer app gains offline work.
- Feature gating is enforced only in the browser; status logic is matched by regex.
- Quotes and invoices: decide whether they belong at all.

**Missing from the presentations, but users depend on it:**

- Copying orders between companies, and accept/reject. It's the most-polled endpoint, behind the
  "unaccepted" badge.
- Hours, km, odometer and travel registration. Materials from van or warehouse stock.
- Engineer GPS and assignment by distance.
- Signatures and the emailed PDF as legal proof.
- Status emails and .ics invites to customers. Customers viewing the planned schedule.
- Excel imports of customers, units and locations.
- Other tenants' needs:
  - several customers
  - a staffing flavour (temps)
  - Gripp, Teamleader and payroll integrations

### What it corrects below

- **Problem (1).** It isn't "no platform". The platform knows units, but not their condition,
  inspections or parts. The scope is **the successor to My24Service and SHLTR Connect, for its
  existing tenants too**, not a system for SHLTR alone. The first thing to ship stands (checklist
  per unit plus status), but **inside the existing order, work-order and QR flow**.
- **Two hats.** SHLTR still decides the product's direction, but **the existing tenants' daily
  work (Rite-Hite's above all) is a guard rail** it can't overrule.
- **Personas (2).**
  - Planner: the accept step and the dispatch board are now confirmed.
  - Engineer: phone app, online only; hours, km, materials, photos and signatures already go into
    it. Mostly active 06:00–20:00. The "WhatsApp photos" guess was wrong.
  - Facility manager: **a reader**. They come for units, documents and the schedule. Ordering and
    QR scans are rare.
  - New secondary group: the **other service companies already on the platform**. They need their
    current flows to keep working.
- **Jobs (3).**
  - P2 is served better than thought: 6 → 7.
  - New, already served fairly well: **L1, looking up units and documents** (8 / 6).
  - The biggest gaps are still P1, P5 and the checklist (E1, unmet since 2019).
- **Journeys (4).**
  - The engineer's current state is the app with photos, materials, hours and signatures, not
    paper and WhatsApp. The pain is no checklist, free-text findings, and being online only.
  - The facility manager gets status emails after acceptance and can see the order and its date.
    The waiting pain is smaller than claimed; the audit pain stands.
  - "No signal" is a confirmed gap.
- **Success (5).** The north star stands; its baseline of zero checklists is confirmed. More guard
  rails and measurable indicators are added there.
- **For the designers (6–7).** Branding must work per tenant (the `default` family exists beside
  `shltr`), not only for SHLTR. The portal's home should serve reading first: units, documents,
  schedule.

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
  **Mostly a reader:** at Riedel, 15 days held 167 equipment reads, 83 document reads and 58
  schedule views, against 3 orders and 7 QR scans. [S: My24 prod-logs]
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
| P2  | Planner          | When a breakdown or critical finding comes in, I want to accept it, create the order with the right units, assign the engineer and reserve the part in one flow, so I get a first-time fix.        |    9 |      7 |     2 |
| P3  | Planner          | When a period starts, I want the year's inspections and contract visits per unit laid out, so I can fill the agenda without counting by hand.                                                      |    8 |      3 |     5 |
| P4  | Planner          | When an engineer finishes, I want the checklist results to update condition, inspection date and status, and the report to reach the customer, so I can stop chasing paperwork.                    |    8 |      4 |     4 |
| P5  | Planner          | When a finding says a part is worn, I want the matching article offered or quoted to the customer, so I can sell the repair instead of waiting for the breakdown.                                  |    7 |      1 | **6** |
| E1  | Engineer         | When I stand at a unit, I want its fixed checklist and history on my phone, so I can tick it off, record findings with a photo, get a signature and move on, with no typing in the van afterwards. |    8 |      3 |     5 |
| L1  | Facility manager | When a question comes up about a unit, I want its details, documents and planned visits, so I can answer without calling SHLTR. [S: My24 prod-logs]                                                |    8 |      6 |     2 |
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

| Who              | Today                                                                                       | Strengths                                                                                     | Weaknesses                                                 | Switching cost                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Planner          | My24Service, plus Excel, email, phone and memory                                            | Orders, the planning board, signatures and QR reporting all work, and customers are onboarded | Free-text states, no checklists, no ranking, no part links | High: customers, QR codes, the app and history all live there     |
| Engineer         | My24Service app (hours, km, materials, photos, signatures; online only), checks from memory | Familiar; signing works                                                                       | Free text, no checklist                                    | The new tool must be at least as fast                             |
| Facility manager | Supplier PDFs, Excel, email                                                                 | —                                                                                             | Nothing is in one place                                    | Low, if SHLTR fills the data (it does the inventory) [S: RIE p11] |

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

| Phase          | Today                                                                                                                                                                          | Desired                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arrive         | Opens the order in the app; the unit's history is hard to see (5–10 min).                                                                                                      | **Scans the unit's QR code** (or picks it from the order), and sees the unit card: last inspection, open findings, condition [S: SOL p6].                                            |
| Inspect        | NEN checks from memory or paper; gloves, ladder, cold (20–30 min).                                                                                                             | The fixed checklist for the unit's type, **one point at a time, big goed / afkeur / n.v.t. (good / rejected / not applicable) buttons**, **fully offline**. [S: RIE p10; I: offline] |
| Rejected point | Cables frayed at the drum, none on the van; a photo in the app and a free-text note, linked to nothing (no part, no follow-up). "Hopefully someone follows this up." [S: My24] | One tap: afkeur, a photo and a short note; **the matching part is suggested** and becomes a follow-up for the office [S: PB p7]. Relieved.                                           |
| Sign           | Hunts for the contact; both sign one PDF for the whole order (5–15 min).                                                                                                       | The customer signs once for the visit; the report shows per unit what was checked and rejected; condition, inspection date and status update by themselves [S: CO p2].               |
| Leave          | Phones the office about the part.                                                                                                                                              | No call needed.                                                                                                                                                                      |

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

| Phase    | Today                                                                                                                                                                           | Desired                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaks   | Dock 6 won't close; walks over, scans the QR code (if they remember) or phones. Anxious: trucks waiting, the cold store open.                                                   | Scans the QR code: the unit is already identified; two taps: storing (breakdown), a photo, "trucks waiting".                                                                |
| Waits    | Until the planner accepts it, **silence**; after that, status emails and the order with its date in the portal [S: My24]. Calls when it takes long. Smaller than first thought. | **Follows it like a parcel**: received → accepted → planned (engineer, time) → on the way → done, with a notification at each step. Reassured. [I: CO p5 "dezelfde status"] |
| Resolved | The engineer fixes it; they sign; a PDF arrives by mail into a folder. Will it recur? Unknown.                                                                                  | The report sits on the unit's card; rejected parts show as "aandacht" with advice and a price to approve [S: EN p24–25].                                                    |
| Audit    | Two weeks of collecting PDFs from email and suppliers into Excel. Anxious, days of work.                                                                                        | Open the site, filter fire doors: all green or "gepland"; **one PDF per site with the history per year**; 10 minutes [S: RIE p9–10]. Safe, competent.                       |

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
  - Every inspection is done on the checklist, and findings are per unit, not free text.
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
  - **existing tenants' daily flows keep working**: Rite-Hite's work orders, hours and materials
    above all [S: My24 prod-logs]
  - the QR stickers already on site keep resolving
  - copying orders between partners, with accept/reject, keeps working
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
- **From version 1** (section 0):
  - **Branding per tenant**, not only SHLTR's brand. The SHLTR theme is the first of several; a
    tenant on the `default` family keeps a neutral theme.
  - **The customer portal's home serves reading first:** units, documents, the schedule. Reporting
    a breakdown stays one tap away (QR or a button).
  - **The engineer views must work offline.**
  - **Keep the shltr app's UX rules** (`my24-mobile/docs/ux-principles.md`): a stepped order form,
    land on the list, show the photo.

## 8. Assumptions and risks

- **The engineer persona is partly guesswork.** The app's use is now known from version 1 (photos,
  hours, materials, signatures, online only), but gloves, timings and language are unverified. Risk: building a checklist that engineers skip, which starves the whole
  product of data.
- **The planner's day is inferred** from the business and from My24Service, not observed.
- **Facility managers come weekly at most, mostly to read** (section 0). Whether condition and
  inspection status will draw them in more often is unknown.
- **Selling to installers is already the business** (about 24 tenants, Rite-Hite the heaviest),
  but the presentations only cover manufacturers. The successor must win existing tenants over, not
  only SHLTR's customers.
- **The numbers are partly unknown:** units under contract, engineers and planners. SHLTR's own
  volume in version 1 is low (19 orders in 15 days), which is unexplained.
- **Three product names** (Installation Suite, SHLTR Connect, SOLOFY Connect) and the scope drift
  (energy, AI, sales pipeline) are the owner's own tensions.

## 9. Questions for the real product owner

Ten minutes with him would settle the biggest guesses. Version 1 answered some of the first list
in part (section 0); what's left, and what it raised:

1. How many units do you maintain under contract, with how many planners and engineers? And why is
   SHLTR's own volume in My24Service low: do the engineers work outside it, or through partners?
2. Do your engineers need to work offline (cold stores, steel halls), and what do they still do
   outside the app (paper checklists)?
3. Can we spend half a day with a planner and ride along with an engineer for one morning?
4. Would condition and inspection status make customers come to the portal more often than they
   read it now?
5. How much do Rite-Hite and the other `default`-family tenants matter? Must the successor serve
   them from day one, and is the manufacturer route (Salvo) next to that or instead?
6. "SHLTR Connect" is already the name and the domain. Is SOLOFY Connect the white label? Must the
   QR stickers on site keep resolving forever?
7. The brand is night blue, white and mint. Should the office app wear it, or only the customer
   portal?
8. Which mockup elements would you be sad to lose? (Our reading: the condition score, the four
   statuses, the checklist work order, checkpoint-to-part, the Wallet. The banners and drawings
   were for the pitch.)
9. When a checklist point is rejected, should the office or the customer approve the part
   order?
10. What would make you say, three months in, "this was worth it"?
11. Quotations and invoices are barely used in version 1. Should they go, or become the
    "commercial next step" (P5)?
12. Do the staffing flavour (temps) and the Gripp, Teamleader and payroll integrations come along
    to the successor?

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
