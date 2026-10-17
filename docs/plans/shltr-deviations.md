# Where the build deviates from the SHLTR mockup

Every point where what's on `develop` (2026-10-17) differs from the client's Lovable mockup (https://mockup-magic-56.lovable.app/), why, and what the client's own files, received later, change about it. The mockup was read from its compiled pages first and later from its source, its database, Lovable's plans, three presentations and ten versions of the Partner Bonus brochure (kept outside the repo, in `node_modules/.mockup/`). The analysis behind the build is in [shltr-domain.md](shltr-domain.md), the style in [shltr-style.md](shltr-style.md).

248 deviations on 12 pages:

| Kind     | High | Medium | Low | All |
| -------- | ---: | -----: | --: | --: |
| Changed  |   18 |     46 |  77 | 141 |
| Added    |    5 |     37 |  28 |  70 |
| Left out |    0 |     17 |   9 |  26 |
| Not yet  |    3 |      7 |   1 |  11 |

- **Changed**: built differently from the mockup. **Added**: built, though the mockup doesn't show it. **Left out**: in the mockup, not built. **Not yet**: planned, not built.
- **Impact** is how much a client comparing the two would notice.

## 1. What the client's own files change

Where I'd have chosen differently with these files from the start. The rest of the build holds up; section 2 lists what they confirm.

### 1.1 Connect tracks a unit's parts, not the unit

**Done** (2026-10-17): components under each unit, with their article, checkpoints, condition and status, on the unit's page and the Connect page; their own interval and inspection still follow the unit (question 2). See `shltr-domain.md` §7.

Impact high, effort large. Deviations [#99](#99-components-became-units-no-component-register), [#100](#100-article-number--link-to-the-parts-shop-per-row), [#127](#127-per-unit-apparaat-not-per-component), [#113](#113-table-columns), [#101](#101-every-unit-is-in-care).

- **The files:** The Connect presentation: "Connect bundelt alle onderdelen van een klant op één plek. Elk onderdeel heeft een conditiescore, een onderhoudsinterval, een keuringsstatus en een gekoppeld artikelnummer uit de Onderdelen Shop." Its examples are parts of a unit ("Torsieveerpakket D-07 — conditie 22%, keuring verlopen (SD-001)"), and the mockup's database has an `onderdelen` table (code, unit, location, article number, condition, interval, inspection, status, advice) with the work orders hanging on a part.
- **Built:** Condition, inspection and status per unit, with no component table; the parts used come from the unit's orders. That followed the decision after My24Service ("Condition per unit, no component table").
- **I'd change:** A component register under each unit: code, name, the shop's article (a material), its own interval, condition, inspection and advice. Connect lists components, the unit takes the worst of its components, and a rejected point or critical component points at its article in the shop.

### 1.2 The condition score comes from the inspection checklist

**Done** (2026-10-17): every completed checklist (inspection or maintenance) records the share of Goed among Goed and Afkeur as the unit's score, and each component's over its own points; the office's entry stays as a correction. See `shltr-domain.md` §7.

Impact high, effort small. Deviations [#103](#103-condition-score-entered-not-computed), [#140](#140-condition-after-completion), [#105](#105-status-rules), [#108](#108-only-a-maintenance-checklists-rejection-doesnt-flag-the-unit).

- **The files:** What the client told you: a part that passes 4 of 10 points in a keuring has a condition of 40%. The Connect presentation: "De score daalt op basis van cycli, meldingen en bevindingen en wordt na elke afgeronde werkbon opnieuw berekend."
- **Built:** A score the office or the engineer types in by hand after the checklist, with history; no formula.
- **I'd change:** Compute it: the share of Goed among the points answered in the latest completed inspection (N.v.t. left out), recalculated whenever a checklist is completed; keep a manual entry only as a correction. Kritiek under 40% then means fewer than 40% of the points passed.

### 1.3 Kritiek plans itself and reserves the part

Impact medium, effort medium. Deviations [#110](#110-planning-critical-units-automatically), [#107](#107-gepland-no-longer-means-parts-reserved), [#54](#54-expired-inspections-dont-get-priority-in-the-planning).

- **The files:** The Connect presentation's status table: Kritiek → "Binnen 5 werkdagen inplannen, onderdeel direct reserveren"; Gepland → "Onderdelen gereserveerd, monteur toegewezen"; and "Kritieke en geplande onderdelen vullen automatisch de agenda."
- **Built:** An opt-in setting (off by default) that makes a maintenance order for a critical unit within 5 working days; no parts are reserved, and Gepland only means an order is scheduled.
- **I'd change:** Turn the automatic order on by default for SHLTR, put the component's article on that order as a material line (which reserves its stock), and let Gepland mean scheduled with an engineer and the parts reserved.

### 1.4 "SHLTR Connect" is the name of the whole platform

Impact medium, effort small. Deviations [#2](#2-shltr-connect-is-conditiebeheer), [#149](#149-page-and-menu-name), [#6](#6-mockups-one-shell-split-into-three), [#14](#14-brand-block-organization-switcher-instead-of-shltr--installation-suite).

- **The files:** The brochure: "Volg uw Partner Omzet, Bonus Omzet en beschikbare Parts Credit in SHLTR Connect", "de SHLTR Wallet binnen SHLTR Connect"; the platform video presents "SHLTR Connect als één samenhangend platform"; the energy report's header reads "SHLTR Connect · Energy Intelligence Report". In June 2026 the same app was still "SHLTR Installation Suite".
- **Built:** The condition page is "Conditiebeheer" ("Connect" in English), the customer's side is the "Klantportaal", and the app is Fieldworks with the organization's name.
- **I'd change:** A product name per tenant for the app and its portal ("SHLTR Connect"), and the condition page named after what it holds: "Onderdelen" or "Onderdelenbeheer".

### 1.5 Documents are a section of their own

Impact medium, effort large. Deviations [#9](#9-documenten-left-out), [#83](#83-documents-techniek-and-facilitair-left-out), [#76](#76-address-card-with-photo-and-tabs-left-out).

- **The files:** The June presentation gives Documenten its own chapter ("Centrale bibliotheek van alle documenten": type Techniek or Facilitair, linked to equipment and customer, downloadable), and the Connect presentation files "Keuringsrapporten en werkbonnen gekoppeld aan het onderdeel".
- **Built:** Nothing: the app stores no files, so documents waited for file storage (open question 19).
- **I'd change:** File storage and a documents module earlier: uploads per customer, unit or component, typed Techniek or Facilitair, with each completed work order and inspection report filed automatically, and the customer seeing theirs in the portal.

### 1.6 The bonus follows brochure v10: all regular revenue counts

Impact medium, effort small. Deviations [#232](#232-revenue-classification-per-order), [#233](#233-editable-tiers-and-revenue-rules-per-year), [#235](#235-omzet-die-meetelt), [#236](#236-rekenvoorbeeld-tab).

- **The files:** The latest brochure (v10) has four revenue categories (Onderhoudscontracten, Service en onderhoud, Reguliere onderdelen, Reguliere opdrachten), all counting for level and both bonus forms; the project rows of v1–v8 ("Projectomzet kan bijdragen aan een hoger level zonder automatisch bonusgerechtigd te zijn") are gone, and its worked example has Bonus Omzet equal to Partner Omzet (€ 200.000 → € 7.600 or € 9.600). The mockup's code still has seven categories and € 80.000.
- **Built:** The mockup's seven categories as SHLTR's rules, the demo figures € 200.000 / € 80.000, and a per-order classification (Volledig / Gedeeltelijk / Alleen Level / Telt niet mee).
- **I'd change:** Seed v10's four categories and its example; keep the order classification, but show it only when a year has categories that count "Volgens afspraak".

### 1.7 The 15 conditions are the contract, and some are rules

Impact medium, effort medium. Deviations [#237](#237-conditions-shortened-and-fixed), [#247](#247-returns-after-award-exclusions-overdue-suspension).

- **The files:** Brochure v10's 15 articles, among them: no payout while invoices are overdue (art. 4 and 8), returns after the award offset against later bonuses (art. 13), and status that doesn't carry over to the next year (art. 2).
- **Built:** Nine shortened conditions as fixed app copy; overdue suspension and returns after the award aren't enforced.
- **I'd change:** Show the 15 articles as written (editable per programme year), warn on the cash-bonus credit note while the partner has overdue invoices, and book a correction when a settled credit note hits a closed year.

### 1.8 A darker SHLTR brand theme is possible

Impact low, effort small. Deviations [#88](#88-theme-matches-the-mockups-palette), [#92](#92-page-banners-and-coloured-toolbars-not-built).

- **The files:** "SHLTR_merkfilosofie.md" ("Engineered Clarity"): deep night blue, bright white and technical mint green; tall, compact headings. It describes the brochure; the platform video also uses the dark style with teal accents. The app mockup itself is light with teal.
- **Built:** The Lagoon theme, copied from the light app mockup.
- **I'd change:** Nothing needed; if SHLTR wants the app to match the brochure, a second theme (night-blue sidebar, mint accent, condensed headings) is a small job.

## 2. What they confirm

- **The mockup was meant for SHLTR's customers.** Lovable's plan for the bonus calls it "een klantgerichte, klikbare mockup", the brochure addresses the customer ("Wat ziet uw klant?"), and Connect promises "dezelfde status voor servicedesk en klant". SHLTR as the tenant with a customer portal, and the shop, bonus and wallet in that portal, fit what they meant. ([#6](#6-mockups-one-shell-split-into-three), [#203](#203-the-shop-lives-in-the-customer-portal), [#225](#225-the-page-lives-in-the-customer-portal), [#122](#122-connect-in-the-customer-portal))
- **The simulations and fixed figures were only for the demo.** The mockup's own rules: "Keep the Parts Credit checkout demonstrative and client-local because this project presents a mockup, not a financial ledger"; the energy plan simulates P1 "zonder echte meetbron". A real wallet ledger, feeds and simulators beside the app were the right reading. ([#175](#175-real-meter-data-instead-of-an-in-page-simulation), [#150](#150-real-data-from-a-salvo-feed-instead-of-static-data), [#238](#238-wallet-card))
- **Focus AI isn't SHLTR's; AI Support is a real assistant.** The Focus AI page is a generic sales tool ("Focus AI scant automatisch je pijplijn op deals zonder recente activiteit"), so leaving it out stays right. AI Support, though, is a working chat assistant in the mockup's code that "denkt mee over storingen, opdrachten en de app": not decorative, and a candidate for later. ([#10](#10-focus-ai-left-out), [#11](#11-ai-support-left-out), [#196](#196-focus-ai))
- **The orders and their statuses come from My24Service.** The June presentation's Opdrachten table (10241–10246, engineers "Weggemans01" and "lev", statuses Nieuw, In behandeling, Geaccepteerd, Verzonden, Afgerond) is My24Service's data. That supports an import of the order history, and leaves "Verzonden" to ask about. ([#35](#35-order-statuses-geaccepteerd-and-verzonden-dont-exist), [#36](#36-order-numbers-in-another-format), [#74](#74-import-of-the-clients-register))
- **Visit preferences stay on the site.** The mockup's database stores them per customer (contract, priority, channel, day, time slot, note). You decided they belong to the site, which a customer with several sites needs; nothing in the files argues against it. ([#117](#117-customer-panel-on-choosing-a-customer), [#77](#77-sites-with-visit-preferences-and-access-notes))

## 3. The decisions behind most deviations

- **SHLTR is the tenant; its customers get a portal.** The mockup is one shell that mixes the office's pages with a customer's account. The app has three: the office, the engineer portal and the customer portal. The shop, the bonus and the wallet are the customer's; the office gets the pages to run them. ([#6](#6-mockups-one-shell-split-into-three), [#31](#31-office-dashboards-bonus-card-is-an-overview-of-all-partners), [#203](#203-the-shop-lives-in-the-customer-portal), [#225](#225-the-page-lives-in-the-customer-portal))
- **A checklist per unit per order, on the engineer portal.** There is no yearly werkbon per asset. An inspection or maintenance order gives each of its units a checklist, which the assigned engineer fills in on their phone, and both engineer and customer sign the work order. ([#124](#124-no-werkbonnen-page-menu-item-is-checklists-templates), [#128](#128-starting-a-checklist), [#133](#133-who-fills-it-in-where), [#139](#139-signatures-of-engineer-and-customer))
- **Real data and derived statuses instead of stored demo values.** Statuses (Kritiek, Laden, Piekbelasting) follow from rules over real records instead of being typed in. Docks and energy read event feeds, with simulators for the demo; the real Salvo and P1 links aren't built. ([#105](#105-status-rules), [#150](#150-real-data-from-a-salvo-feed-instead-of-static-data), [#175](#175-real-meter-data-instead-of-an-in-page-simulation), [#231](#231-figures-from-the-apps-own-invoices))
- **Built for many customers and tenants.** Single cards became lists with search and filters, fixed numbers became settings (thresholds, tiers, templates, categories), and module names are generic (Conditiebeheer, Docks, Partnerprogramma) because every tenant gets them. ([#7](#7-klanten-opens-a-customer-list-not-one-customer-card), [#109](#109-thresholds-are-a-setting), [#233](#233-editable-tiers-and-revenue-rules-per-year), [#2](#2-shltr-connect-is-conditiebeheer))
- **The app's own look and patterns.** The Lagoon theme copies the palette, but pages keep the app's page header, filter menus and cards: no teal banners or toolbar bands, no chip rows, informal "je" in Dutch. ([#92](#92-page-banners-and-coloured-toolbars-not-built), [#62](#62-category-chips-replaced-by-filter-menus), [#216](#216-search-placeholder-and-wording))
- **Added because the real thing needs it.** Order handling for the shop, closing a bonus year, credit notes, accepting partners, QR codes, integration tokens and signatures exist because a working system needs them, though the mockup only names them in passing or not at all. ([#204](#204-office-order-handling), [#241](#241-year-close-in-the-office), [#242](#242-cash-bonus-paid-with-a-credit-note), [#243](#243-accepting-partners), [#148](#148-qr-codes-to-reach-the-unit))
- **Left out, on purpose or for now.** Focus AI and AI Support, documents (no file storage), tasks, global search, notifications and the explanatory banners aren't there. ([#10](#10-focus-ai-left-out), [#9](#9-documenten-left-out), [#38](#38-tasks-with-due-dates-left-out), [#19](#19-global-search-left-out), [#20](#20-notifications-bell-left-out))

## 4. The high-impact deviations

|                                                                                     # | Page            | Kind    | Deviation                                                                             |
| ------------------------------------------------------------------------------------: | --------------- | ------- | ------------------------------------------------------------------------------------- |
|                              [4](#4-werkbonnen-is-checklists-and-opens-the-templates) | App shell       | changed | "Werkbonnen" is "Checklists" and opens the templates                                  |
| [5](#5-partner-bonus-is-partnerprogramma-office-and-partner-bonus-only-in-the-portal) | App shell       | changed | "Partner Bonus" is "Partnerprogramma" (office) and "Partner Bonus" only in the portal |
|                                            [6](#6-mockups-one-shell-split-into-three) | App shell       | changed | Mockup's one shell split into three                                                   |
|                 [31](#31-office-dashboards-bonus-card-is-an-overview-of-all-partners) | Dashboard       | changed | Office dashboard's bonus card is an overview of all partners                          |
|                              [32](#32-shltr-wallet-panel-not-on-the-office-dashboard) | Dashboard       | changed | SHLTR Wallet panel not on the office dashboard                                        |
|                                                    [45](#45-week-and-day-views-built) | Planning        | added   | Week and day views built                                                              |
|                                              [61](#61-staat-replaced-by-two-statuses) | Apparatuur      | changed | "Staat" replaced by two statuses                                                      |
|                                                    [67](#67-rows-lead-to-a-unit-page) | Apparatuur      | added   | Rows lead to a unit page                                                              |
|                                              [74](#74-import-of-the-clients-register) | Apparatuur      | not yet | Import of the client's register                                                       |
|                               [99](#99-components-became-units-no-component-register) | SHLTR Connect   | changed | Components became units (no component register)                                       |
|                                      [103](#103-condition-score-entered-not-computed) | SHLTR Connect   | changed | Condition score: entered, not computed                                                |
|                                                              [105](#105-status-rules) | SHLTR Connect   | changed | Status rules                                                                          |
|                      [124](#124-no-werkbonnen-page-menu-item-is-checklists-templates) | Werkbonnen      | changed | No "Werkbonnen" page; menu item is "Checklists" (templates)                           |
|                                                      [128](#128-starting-a-checklist) | Werkbonnen      | changed | Starting a checklist                                                                  |
|                                                     [133](#133-who-fills-it-in-where) | Werkbonnen      | changed | Who fills it in, where                                                                |
|                                       [139](#139-signatures-of-engineer-and-customer) | Werkbonnen      | added   | Signatures of engineer and customer                                                   |
|                        [150](#150-real-data-from-a-salvo-feed-instead-of-static-data) | Salvo Docks     | changed | Real data from a Salvo feed instead of static data                                    |
|                                                [151](#151-the-real-salvo-integration) | Salvo Docks     | not yet | The real Salvo integration                                                            |
|                          [175](#175-real-meter-data-instead-of-an-in-page-simulation) | Energie         | changed | Real meter data instead of an in-page simulation                                      |
|                                                       [177](#177-real-p1-integration) | Energie         | not yet | Real P1 integration                                                                   |
|                          [195](#195-alerts-become-orders-instead-of-a-focus-ai-batch) | Energie         | changed | Alerts become orders instead of a Focus AI batch                                      |
|                                     [203](#203-the-shop-lives-in-the-customer-portal) | Onderdelen Shop | changed | The shop lives in the customer portal                                                 |
|                                                     [204](#204-office-order-handling) | Onderdelen Shop | added   | Office order handling                                                                 |
|                                     [225](#225-the-page-lives-in-the-customer-portal) | Partner Bonus   | changed | The page lives in the customer portal                                                 |
|                                        [231](#231-figures-from-the-apps-own-invoices) | Partner Bonus   | changed | Figures from the app's own invoices                                                   |
|                         [239](#239-the-customer-chooses-cash-or-credit-in-the-portal) | Partner Bonus   | added   | The customer chooses cash or credit in the portal                                     |

## 5. Questions for the client

1. Is the condition score per component or per unit? If a 10-point keuring with 4 Goed gives 40%: do N.v.t. points count, and does a maintenance checklist change the score too?
1. Should components get their own interval and inspection, or do they follow their unit's?
1. Is "SHLTR Connect" the name for everything, the office included, or only for what customers see? And may the office menu say "SHLTR Connect", "Salvo Docks" and "Partner Bonus"?
1. Which documents should the app hold, who uploads them, and which may the customer see?
1. Is brochure v10 the programme to build, without the project rules of the earlier versions?
1. What does "Verzonden" mean for an order in My24Service, and should the import keep it?
1. Should the header search and the notification bell come back, and what would they find and announce?
1. Should SHLTR's users be able to switch themes, or should Lagoon be fixed for the tenant?
1. Does Salvo report the beacon, a booked time slot and a fault's reason, and who is the dock planner who gets the 40-minute notice?
1. Is the energy kWh threshold per day, or per chosen period (the mockup compared it with the month's total too)?
1. Does a partly paid invoice count partly, or only once it's paid in full?

## 6. Every deviation, page by page

### App shell (mockup `sidebar and header`, built: office, engineer and customer apps)

#### 1. Sidebar entries renamed, regrouped and reordered

_Changed, medium impact._

- **Mockup:** one flat list of 14 items in this order: Dashboard, Planning, Klanten, SHLTR Connect, Salvo Docks, Energie, Apparatuur, Werkbonnen, Onderdelen Shop, Partner Bonus, Opdrachten, Documenten, Focus AI, AI Support.
- **Built:** three labelled groups. **Werk**: Dashboard, Opdrachten, Planning, Activiteit. **Stamgegevens**: Klanten, Apparatuur, Checklists, Conditiebeheer, Docks, Onderhoudsplannen, Monteurs, Materialen, Onderdelen Shop. **Modules**: Servicecontracten, Energie, Facturatie, Partnerprogramma. Core entries come first, and each module goes after the entry its manifest names (`placeNav()`, `src/lib/modules/nav.ts`).
- **Why:** consistency with the rest of the app. The core sections come first and the optional modules go into slots (`nav.after` in each `module.ts`), so the list is the same for every tenant and shrinks when a module is switched off.

#### 2. "SHLTR Connect" is "Conditiebeheer"

_Changed, medium impact._

- **Mockup:** sidebar "SHLTR Connect" (gauge icon) → `/connect`.
- **Built:** sidebar "Conditiebeheer" (gauge icon) → `/condition`. The product name "SHLTR Connect" appears nowhere in the UI (only in commit messages and docs).
- **Why:** modules are named generically, because they belong to a multi-tenant product (`condition_module_name`). There's no per-tenant renaming of modules. Not decided with the client.

#### 3. "Salvo Docks" is "Docks"

_Changed, low impact._

- **Mockup:** "Salvo Docks" (truck icon).
- **Built:** "Docks" (warehouse icon), with Salvo named only inside the module's pages.
- **Why:** a generic module name. Unknown whether the client wants the brand.

#### 4. "Werkbonnen" is "Checklists" and opens the templates

_Changed, high impact._

- **Mockup:** "Werkbonnen" (clipboard-check) → the digital checkpoint work order page.
- **Built:** "Checklists" (clipboard-check) → `/checklists/templates` ("Checklistsjablonen"). The checklists are filled in on the orders and in the engineer portal (§7, phase 1).
- **Why:** a checklist is one per unit per order (§5 "What My24Service tells us"), so the sidebar leads to the template setup and not to a work-order screen.
- **Now:** the sidebar's "Werkbonnen" ("Work orders") opens the work orders page (`/checklists`); the templates are a button on it and the module's settings page.

#### 5. "Partner Bonus" is "Partnerprogramma" (office) and "Partner Bonus" only in the portal

_Changed, high impact._

- **Mockup:** "Partner Bonus" in the one shell, written to the customer ("Uw samenwerking…").
- **Built:** office sidebar "Partnerprogramma" (the partners' administration); the customer's own "Partner Bonus" page is in the customer portal's navigation (`partners_portal_label`).
- **Why:** decision A, SHLTR is the tenant and customers use a portal (§1, §5 "Decided in phase 4a").

#### 6. Mockup's one shell split into three

_Changed, high impact._

- **Mockup:** one shell mixes office pages (Planning, Apparatuur…) and customer-account pages (Partner Bonus, Wallet, Shop met Parts Credit).
- **Built:** the office app `(app)`, the engineer portal `/my` (`(field)`) and the customer portal `/portal` (`(customer)`), each with its own navigation. Engineers are sent from the office app to their portal.
- **Why:** decision A (§1) and phase 4a (§5): roles office/engineer/customer.

#### 7. "Klanten" opens a customer list, not one customer card

_Changed, medium impact._

- **Mockup:** "Klanten" → `/klant`, straight to the single card "Klantkaart — Riedel B.V.".
- **Built:** "Klanten" → `/customers`, a table (Klant, Segment, Contactpersoon, Locatie, Open opdrachten, Apparatuur, Klant sinds); a row opens `/customers/[code]`.
- **Why:** consistency with the rest of the app; a real tenant has many customers.

#### 8. Opdrachten is a core section near the top, with a badge

_Changed, medium impact._

- **Mockup:** "Opdrachten" 11th in the list (page not in scope of the mockup analysis).
- **Built:** "Opdrachten" second, with a counter badge of the orders customers reported in the portal that wait for acceptance (`watchAwaitingAcceptance`).
- **Why:** phase 4a acceptance step (§5 "Decided in phase 4a").

#### 9. Documenten left out

_Left out, medium impact._

- **Mockup:** sidebar "Documenten".
- **Built:** no documents section. The app doesn't store files yet.
- **Why:** no file storage; documents are open question 19 (§5).

#### 10. Focus AI left out

_Left out, medium impact._

- **Mockup:** sidebar "Focus AI".
- **Built:** none.
- **Why:** out of scope (§4.1 "Energy alerts → Focus AI batches: Out of scope"; §6 phase 5 "Focus AI stays out").

#### 11. AI Support left out

_Left out, low impact._

- **Mockup:** sidebar "AI Support" (message-circle).
- **Built:** none.
- **Why:** out of scope (header of shltr-domain.md: the AI pages aren't analysed).

#### 12. Sections the mockup doesn't have

_Added, medium impact._

- **Mockup:** none of these.
- **Built:** sidebar entries Activiteit (the audit log), Monteurs, Materialen, Onderhoudsplannen, Servicecontracten, Facturatie.
- **Why:** Fieldworks' core and modules; SHLTR's demo organization has every module on (`seed/index.ts`).

#### 13. Sidebar group labels

_Added, low impact._

- **Mockup:** no group headings.
- **Built:** small uppercase group labels "WERK", "STAMGEGEVENS", "MODULES".
- **Why:** consistency with the app's sidebar (Lagoon `sidebar-group-label`).

#### 14. Brand block: organization switcher instead of "SHLTR / Installation Suite"

_Changed, low impact._

- **Mockup:** teal tile with a building icon, "SHLTR" and "Installation Suite"; static.
- **Built:** teal tile with a factory icon, the organization's name ("SHLTR") and the tagline "Servicebeheer"; it's a menu to switch organization and go to "Organisatie-instellingen".
- **Why:** multi-tenant app (a user can be in several organizations); the tagline is generic.

#### 15. Instellingen moved into the organization menu

_Changed, low impact._

- **Mockup:** a "Instellingen" button at the bottom of the sidebar (no-op).
- **Built:** "Organisatie-instellingen" in the organization switcher menu at the top of the sidebar → `/settings` (managers).
- **Why:** consistency with the app.

#### 16. User block is a menu with language and sign-out

_Changed, low impact._

- **Mockup:** static "JW · Jan Weggemans · jan@shltr.nl" at the bottom.
- **Built:** the same avatar/initials, name and e-mail, as a menu with a language switch (English/Nederlands) and "Afmelden". The seeded user is jan@shltr.example with role member.
- **Why:** a real login (better-auth); the app is bilingual.

#### 17. Collapsible sidebar and mobile navigation

_Added, medium impact._

- **Mockup:** the sidebar is `hidden md:flex`, so on a phone there's no navigation at all; it can't collapse.
- **Built:** a sidebar toggle in the header; on desktop it collapses to icons (with tooltips and a rail), on a phone it opens as a sheet.
- **Why:** the app is responsive.

#### 18. Page title moved from the header bar into the page

_Changed, low impact._

- **Mockup:** the top bar shows the page title ("Dashboard", "Planning", "Klantkaart — Riedel B.V."), sticky.
- **Built:** the top bar holds only the sidebar toggle and, at the right, a sync indicator, a theme switcher and a light/dark switcher. The title is on the page itself (`PageHeader`: title, description, breadcrumbs on detail pages). The bar doesn't stick.
- **Why:** consistency with the app's page header.

#### 19. Global search left out

_Left out, medium impact._

- **Mockup:** "Zoeken…" input in the top bar (decorative).
- **Built:** no global search. Each list has its own search box.
- **Why:** unknown (it wasn't functional in the mockup).

#### 20. Notifications bell left out

_Left out, medium impact._

- **Mockup:** a bell with a red dot in the top bar (decorative).
- **Built:** none. The nearest equivalents are the Opdrachten badge and live-updating pages.
- **Why:** unknown; nothing in the mockup said what it would notify.

#### 21. Theme and dark-mode switchers in the header

_Added, medium impact._

- **Mockup:** none, light only.
- **Built:** a theme picker (Lagoon by default; also Neutral, Harbor, Blueprint, Brutalist, Sorbet) and Light/Dark/System, saved per browser (cookie).
- **Why:** part of the app before SHLTR; Lagoon was added and made default for SHLTR (commits 8a861d0d, 01cd05f3).

#### 22. Sync indicator, loading bar and page skeletons

_Added, low impact._

- **Mockup:** none.
- **Built:** a sync/offline indicator in the header (the service worker's cache), a progress bar and a page skeleton while a page loads, and a notice when a new version is deployed.
- **Why:** the app's offline/stale-while-revalidate cache and navigation loading.

#### 23. Bilingual interface

_Added, low impact._

- **Mockup:** Dutch only (with stray English: "Information", "Log", "Order Types").
- **Built:** English and Dutch for everything. The language comes from a cookie, then the browser, then a Dutch guess, then English.
- **Why:** CLAUDE.md, every text is a Paraglide message in en and nl.

#### 24. Print hides nothing

_Changed, low impact._

- **Mockup:** sidebar and header are `print:hidden`.
- **Built:** no print styles for the shell. The work order and invoices have their own PDFs; the QR label sheets have a print page.
- **Why:** unknown.

### Dashboard (mockup `/`, built: /)

#### 25. No personal greeting

_Changed, low impact._

- **Mockup:** "Goedemorgen, Jan" / "Hier is wat er vandaag speelt."
- **Built:** "Dashboard" / "Hoe het servicewerk er nu voor staat."
- **Why:** unknown (generic copy).

#### 26. KPI tiles: a different set

_Changed, medium impact._

- **Mockup:** four tiles: Open opdrachten 24 (+3 deze week), Actieve klanten 186 (+12 deze maand), Orders deze week 47 (+18%), Laag voorraad 4 (Bestel tijdig).
- **Built:** core tiles "Open opdrachten" (detail "N zonder monteur"), "Te accepteren" (reported in the portal; links to the list), "Spoed" (open urgent orders), "Omzet, laatste 30 dagen" ("Uit N afgeronde opdrachten"), "Apparatuur die aandacht nodig heeft" ("Van N geïnstalleerde apparaten"). The modules add "Lage voorraad", "Open shopbestellingen" ("N te bevestigen"), "Open energie-alerts" ("N boven een grenswaarde") and "Apparaten met aandacht" ("N kritiek · N aandacht"), each with a "Bekijken" button.
- **Why:** these figures come from real data; the tiles that modules add use the `dashboard.stats` slot (§4.1 "Dashboard KPIs").

#### 27. "Actieve klanten" left out

_Left out, low impact._

- **Mockup:** "Actieve klanten 186 · +12 deze maand".
- **Built:** no customer count on the dashboard.
- **Why:** unknown (§4.1 lists it as a core stat to build, but it wasn't built).

#### 28. "Orders deze week" (shop orders) changed into open shop orders

_Changed, low impact._

- **Mockup:** "Orders deze week 47 · +18%" with a shopping-bag icon.
- **Built:** "Open shopbestellingen" (count of open shop orders, "N te bevestigen"), no weekly count.
- **Why:** unknown; the built tile answers "what needs handling".

#### 29. No trend lines on tiles

_Left out, low impact._

- **Mockup:** every tile has a trend ("+3 deze week", "+18%", "Bestel tijdig") and a trending-up glyph.
- **Built:** a factual detail line, no comparison with an earlier period.
- **Why:** unknown (the mockup's trends were hard-coded).

#### 30. Tiles without icons

_Changed, low impact._

- **Mockup:** a coloured icon top left (teal, sky, emerald, amber), the number in `text-2xl`, label below.
- **Built:** label above, a larger number (`text-3xl`), detail below, no icon; module tiles have a "Bekijken" button at the top right.
- **Why:** shltr-style.md "What a theme can't do": stat tiles with an icon are page composition, not built.

#### 31. Office dashboard's bonus card is an overview of all partners

_Changed, high impact._

- **Mockup:** "SHLTR Group Partnerprogramma · Partner Bonus 2027" for one account: status PLATINUM, Partner Omzet €200.000, Bonus Omzet €80.000, "Naar PLATINUM+" with an 80 % bar, "Nog €50.000 tot PLATINUM+", Verwachte Cash Bonus €3.040 / SHLTR Parts Credit €3.840, button "Bekijk programma en voorwaarden".
- **Built:** office card "Partnerprogramma {year}": the number of partners per level reached so far and "Te besteden credit" (all wallets together), link to the partners list. One customer's level, figures and progress are on that customer's page (side card "Partner Bonus {year}") and on the customer portal's home page.
- **Why:** decision A (§1), the office is SHLTR, the account view belongs to the customer (phase 3/4b, §7).

#### 32. SHLTR Wallet panel not on the office dashboard

_Changed, high impact._

- **Mockup:** dark panel "SHLTR Wallet · Bonusjaar 2026": Toegekend €3.750, Al besteed – €1.475, Nu beschikbaar €2.275, Geldig tot 31 december 2027, button "Besteed Parts Credit", note "Toegekend saldo staat los van uw verwachte bonus over 2027."
- **Built:** the wallet is on the customer portal's home page (`client.home`) and the partner's card in the office; the office dashboard only totals outstanding credit.
- **Why:** decision A (§1); the wallet is the customer's.

#### 33. Bonus year follows the calendar

_Changed, low impact._

- **Mockup:** "Partner Bonus 2027" with wallet bonus year 2026 (the mockup's dates are inconsistent, §1).
- **Built:** the current year (2026 now) and its previous year's award.
- **Why:** real dates.

#### 34. "Recente opdrachten" became "Komend werk"

_Changed, medium impact._

- **Mockup:** "Recente opdrachten" (link "Bekijk alle" → /opdrachten): Nr., Klant, Status (Nieuw / In behandeling / Geaccepteerd / Verzonden / Afgerond badges), Datum, Bedrag.
- **Built:** "Komend werk · De eerstvolgende ingeplande opdrachten" (button "Alle opdrachten"): Opdracht, Klant, Apparaat ("Deur 07 +14"), Monteur, Prioriteit, Gepland. No status and no amount.
- **Why:** unknown; Fieldworks' dashboard showed upcoming work before SHLTR (commit 6dac5243, 9724c297).

#### 35. Order statuses "Geaccepteerd" and "Verzonden" don't exist

_Changed, medium impact._

- **Mockup:** the pipeline Nieuw → In behandeling → Geaccepteerd → Verzonden → Afgerond.
- **Built:** Nieuw (te accepteren) → Nieuw → Ingepland → In behandeling → Afgerond → Gefactureerd, or Geannuleerd. "Geaccepteerd" is the planner accepting a portal order; "Verzonden" exists only for invoices.
- **Why:** §5 "Decided for phase 0" and "What My24Service tells us"; phase 4a acceptance status.

#### 36. Order numbers in another format

_Changed, medium impact._

- **Mockup:** 10242–10246 (My24Service style).
- **Built:** ORD-2026-02617 and so on (`nextNumber`).
- **Why:** the app's numbering; an import from My24 hasn't been built (§5, §7 "Not built yet").

#### 37. "Snel naar" block left out

_Left out, medium impact._

- **Mockup:** "Snel naar": "Onderdelen Shop · 19 artikelen op voorraad", "Klantkaart · Riedel B.V. — laatst geopend", and an amber notice "3 taken vervallen vandaag: Inspectie hoogwerkers, voorraadcontrole filterset, levering SD-005".
- **Built:** none of the three; the app doesn't track a "last opened" customer.
- **Why:** unknown for the shortcuts; tasks are out of scope (§3.1 "Task … Out of scope for now", open question 20).

#### 38. Tasks with due dates left out

_Left out, medium impact._

- **Mockup:** "3 taken vervallen vandaag" implies tasks besides orders.
- **Built:** no tasks.
- **Why:** §3.1 out of scope; §5 question 20 open.

#### 39. Charts added

_Added, low impact._

- **Mockup:** no charts on the dashboard.
- **Built:** "Apparatuur naar status", "Omzet per maand" (12 months), "Opdrachten per week" (12 weeks, by status).
- **Why:** Fieldworks' dashboard (commit a067fc90).

#### 40. Module cards added

_Added, medium impact._

- **Mockup:** none of these.
- **Built:** "Reactietijden in gevaar" and "Contracten die binnenkort aflopen" (Servicecontracten), the maintenance visits "Te laat" / "Gepland binnen 30 dagen" (Onderhoudsplannen), receivables "Openstaand" / "Te laat" (Facturatie), and a "Recente activiteit" feed ("De laatste wijzigingen in de hele organisatie").
- **Why:** the modules' `dashboard.cards` slot; SHLTR has every module on.

#### 41. Two "attention" tiles side by side

_Added, medium impact._

- **Mockup:** none.
- **Built:** the core's "Apparatuur die aandacht nodig heeft" (status Onderhoud nodig or Buiten gebruik) and Conditiebeheer's "Apparaten met aandacht" (Kritiek/Aandacht from condition and inspections) both appear, with different counts.
- **Why:** the core's status and the condition module's status are separate (§4.1 Equipment: "core `status` stays operational/out-of-service").

#### 42. Live dashboard

_Added, low impact._

- **Mockup:** static.
- **Built:** numbers, charts and activity refresh when anyone changes something.
- **Why:** the app's live queries.

#### 43. Layout width and packing

_Changed, low impact._

- **Mockup:** centred, max 1400px; fixed rows (tiles, bonus+wallet, orders 2/3 + Snel naar 1/3).
- **Built:** full width; tiles in a row; the cards packed into columns (masonry), the upcoming-work card two columns wide.
- **Why:** Fieldworks' dashboard grid (commit 31ce58ba).

### Planning (mockup `/planning`, built: /schedule)

#### 44. Route, and the default view is the week

_Changed, medium impact._

- **Mockup:** `/planning`, opens on the month (Maand); Week and Dag buttons only switch a highlight.
- **Built:** `/schedule` ("Planning" in Dutch), opens on this week; Month/Week/Day are links with the view in the URL (`?view=month&date=…`).
- **Why:** the schedule module was a week board before SHLTR; the month and day views were added for SHLTR in phase 0 (commit 3068cc4e).

#### 45. Week and day views built

_Added, high impact._

- **Mockup:** "Week" and "Dag" have no views.
- **Built:** Week is a dispatch board: one row per engineer (and one for unassigned orders), a column per day, drag-and-drop, "Overboekt" per engineer and day, a backlog "Nog in te plannen" (open orders without a date, by priority and age) and an "Inplannen" dialog (engineer, date, time; fitting engineers first). Dag is the same board for one day.
- **Why:** Fieldworks' schedule module; §4.1 "Extend schedule: month view and day view".

#### 46. Teal toolbar band left out

_Changed, medium impact._

- **Mockup:** a solid teal band with a calendar icon, "Planning", a pill "8 afspraken", prev/next, "Vandaag" and a white-on-teal Maand/Week/Dag segmented control; below it a white bar with "augustus 2026" and the legend.
- **Built:** the standard page header: title "Planning", description "augustus 2026: N opdrachten gepland." (week: "Week 42, …: wie doet wat, en wanneer."), on the right a segmented Maand/Week/Dag (active teal) and outline buttons ‹ Vandaag ›.
- **Why:** shltr-style.md "What a theme can't do": the coloured card header wasn't built.

#### 47. Appointments are orders, with an engineer and a link

_Changed, medium impact._

- **Mockup:** an appointment `{datum, tijd, klant "Riedel B.V. — Ede", soort}` showing "08:30 Riedel B.V. — Storing"; no engineer, no link, nothing to click.
- **Built:** each entry is an order: type icon, time, "Riedel B.V. — Storing", the engineer's initials (wide screens), linking to the order page; the tooltip has number, customer, type, units, description and engineer. The site isn't shown.
- **Why:** §2.2 "Fieldworks fit: these are orders with `scheduledFor`".

#### 48. Legend shows all nine order types

_Changed, low impact._

- **Mockup:** four kinds as pills: Storing (rose), Reparatie (sky), Onderhoud (emerald), Inspectie (violet).
- **Built:** the same colours for those four, plus Installatie (amber), Offerte opname/Offerte-opname (cyan), Schade (orange), Project (indigo), Overig (slate), each with an icon, as a small legend above the calendar. The legend also lists types the tenant hid (SHLTR hides Schade).
- **Why:** SHLTR's order types (§4.1, §5 "Order types stay a fixed set"; commit 2fe0ba93 "the calendar's legend every type").

#### 49. Busy days are capped

_Changed, low impact._

- **Mockup:** every appointment in the cell.
- **Built:** up to three per day, then "+N meer", linking to the day view; the day number also links to it.
- **Why:** real volumes.

#### 50. Today is the real date

_Changed, low impact._

- **Mockup:** "today" fixed at 2026-08-06 (amber cell); "Vandaag" jumps to August 2026.
- **Built:** today in the user's time zone, marked teal (accent tint and a teal day number); "Vandaag" is disabled when the current period is shown. The demo's fixed appointments are moved to this week and next.
- **Why:** real dates.

#### 51. Month as a list on a phone

_Added, low impact._

- **Mockup:** the 7-column grid at every width.
- **Built:** below the large breakpoint the month is a list of its busy days; the week board becomes a list per day.
- **Why:** responsive app.

#### 52. Live planning

_Added, low impact._

- **Mockup:** static.
- **Built:** the month and the board refresh when someone changes an order, engineer or customer elsewhere.
- **Why:** `watchSchedule` (live queries).

#### 53. Portal orders stay off the board until accepted

_Added, low impact._

- **Mockup:** none.
- **Built:** orders with "Nieuw (te accepteren)" aren't in the backlog; cancelled orders aren't shown.
- **Why:** §5 "What My24Service tells us": "nog niet geaccepteerd … and off the planning board".

#### 54. Expired inspections don't get priority in the planning

_Not yet, medium impact._

- **Mockup:** Connect's copy promises "verlopen keuringen krijgen voorrang in de Planning" (text only).
- **Built:** the backlog is sorted by priority and age. The condition module can create an order for a critical unit by itself (a setting: planned within 5 working days), which then lands in the backlog.
- **Why:** §2.2 "There's no code for it"; §5 question 13.

#### 55. Preferred day and time slot not used by the planning

_Not yet, medium impact._

- **Mockup:** (Connect's customer preferences) one preferred day and a time slot per customer.
- **Built:** stored per site and shown on the order page and in the engineer portal, but the planning doesn't warn or suggest by them.
- **Why:** §5 question 15 still open.

### Apparatuur (mockup `/apparatuur`, built: /equipment)

#### 56. All customers' units, not one site's

_Changed, medium impact._

- **Mockup:** 15 static units, all "Riedel B.V. - Ede".
- **Built:** `/equipment`, every unit of the tenant (the 15 Riedel units seeded first, with others for the made-up customers), with columns Klant (name and code) and Vestiging (site and city) instead of one "Vestiging" string.
- **Why:** the real register; sites are records (§4.1 "Sites").

#### 57. Columns differ

_Changed, medium impact._

- **Mockup:** Apparatuur, Vestiging, Merk ("Gorter / SR 60"), Locatie, Staat, Opdrachten.
- **Built:** Apparaat (the name, with a second line "Fabrikant model · serienummer"), Categorie, Status, Klant, Vestiging, Locatie, Geïnstalleerd, Garantie, Open opdrachten, plus module columns Conditie (score bar), Conditiestatus, Keuring and Volgend onderhoud. Columns can be hidden.
- **Why:** Fieldworks' equipment record (serial, make, dates) plus SHLTR's name, site and location (phase 0) and the modules' `equipment.list` columns.

#### 58. "Merk" split into manufacturer and model, both required

_Changed, medium impact._

- **Mockup:** one free "merk" string, often empty ("—").
- **Built:** Fabrikant and Model are separate and required in the form; there's a manufacturer filter.
- **Why:** §4.1 "Brand / model: Exists (split 'Gorter / SR 60')". The seeded mockup units keep their empty values, but new units can't be saved without both.

#### 59. Every unit needs a serial number

_Added, medium impact._

- **Mockup:** no serial numbers.
- **Built:** a required serial number (capitals, digits, dashes) that is the unit's address (`/equipment/<serial>`); the seed generates them (e.g. DTC3Q2VDQJ).
- **Why:** Fieldworks' equipment model.

#### 60. Category is chosen, not guessed from the name

_Changed, medium impact._

- **Mockup:** the category follows from keywords in the name ("brd"/"branddeur"/"brandwerend" → Branddeuren, "sectionaaldeur", "automatische/schuifdeur/draaideur", "trap", else Overig).
- **Built:** each unit has a category picked in the form, from the tenant's own list that managers edit in settings, each with the engineer specialty that services it. SHLTR's seed has 10: Branddeuren, Sectionaaldeuren, Automatische deuren, Snelroldeuren, Docklevellers, Salvo docks, Klim- & trapmateriaal, Airco / koeltechniek, Hoogwerkers, Overig.
- **Why:** §5 "Decided for phase 0": equipment categories are the tenant's own.

#### 61. "Staat" replaced by two statuses

_Changed, high impact._

- **Mockup:** Staat Goed / Aandacht / Kritiek (pills).
- **Built:** the core Status In bedrijf / Onderhoud nodig / Buiten gebruik / Afgevoerd (the seed maps Aandacht → Onderhoud nodig, Kritiek → Buiten gebruik), and Conditiebeheer's Conditiestatus Kritiek / Aandacht / Gepland / In orde with a 0–100 condition score.
- **Why:** §4.1 Equipment: "staat … derived by the components module … core status stays"; §5 decisions (condition per unit).

#### 62. Category chips replaced by filter menus

_Changed, medium impact._

- **Mockup:** a "SOORT" row of chips "Alle 15", "Branddeuren 5", … (one at a time).
- **Built:** a "Categorie" filter button with counts and multi-select, beside filters for Status, Fabrikant, Klant, Locatie, Geïnstalleerd, Garantie, Open opdrachten and the modules' columns.
- **Why:** consistency with all lists (faceted filters, state in the URL).

#### 63. Grouping by category is optional

_Changed, medium impact._

- **Mockup:** always grouped by category, each group headed by a tinted category badge and "N items".
- **Built:** ungrouped and sorted by name by default; the view menu can group by Categorie (or Status, Fabrikant, Klant), with collapsible group rows in neutral grey.
- **Why:** consistency with the data tables.

#### 64. Search covers more fields

_Changed, low impact._

- **Mockup:** search over name, brand, location and site.
- **Built:** "Apparatuur zoeken…" over serial number, manufacturer, model, name, location, category, customer name and code, site name and city.
- **Why:** the list's server search (`list-sql.ts`).

#### 65. Refresh and export buttons left out

_Left out, medium impact._

- **Mockup:** "Verversen" and "Exporteren" icon buttons (no-ops).
- **Built:** no export; the list updates by itself. Saved views, density and column visibility instead.
- **Why:** unknown (export not planned anywhere).

#### 66. Sorting actually works

_Changed, low impact._

- **Mockup:** sort arrows on every header, no sorting.
- **Built:** click a header to sort (shift-click for several); the arrows show only on the sorted column.
- **Why:** shltr-style.md "What to ignore": sort icons; the table sorts in the database.

#### 67. Rows lead to a unit page

_Added, high impact._

- **Mockup:** rows aren't clickable; there's no unit page.
- **Built:** a unit page `/equipment/<serial>` with specifications, owner, site card, QR code, service history and statistics, the modules' side cards (inspections, condition, maintenance plans, contract, docks), activity, edit and delete.
- **Why:** Fieldworks' equipment section.

#### 68. Creating, editing and bulk actions

_Added, medium impact._

- **Mockup:** read-only.
- **Built:** "Nieuw apparaat", row actions (open, edit, copy serial/customer code), selecting rows (or all matching) to change status or delete.
- **Why:** Fieldworks' equipment section.

#### 69. Locations are records with QR codes

_Changed, medium impact._

- **Mockup:** "Locatie" free text ("Expeditie dock 07").
- **Built:** a location belongs to a site, has its own page (`/equipment/locations/<id>`) and QR code, and units can be printed as QR label sheets per site (`/equipment/labels/<site>`).
- **Why:** §5 "Locations as records with a QR code, and a QR code per unit" (phase 1).

#### 70. Row count shown differently

_Changed, low impact._

- **Mockup:** pill "15 items" in the teal band.
- **Built:** a row count in the table toolbar; the list scrolls in pages.
- **Why:** consistency with the lists.

#### 71. Teal toolbar band left out

_Changed, low impact._

- **Mockup:** teal band with wrench icon, "Apparatuur", pill, search and buttons in white-on-teal.
- **Built:** page header "Apparatuur · Geïnstalleerde apparaten op alle klantlocaties." with the button "Nieuw apparaat", and the table's own toolbar.
- **Why:** shltr-style.md "What a theme can't do".

#### 72. "Opdrachten" is "Open opdrachten"

_Changed, low impact._

- **Mockup:** "Opdrachten" count, teal when > 0.
- **Built:** "Open opdrachten", a plain number, filterable by range.
- **Why:** §2.6 read it as open orders.

#### 73. Pseudo-unit "algeheel onderhoud" kept

_Changed, low impact._

- **Mockup:** "algeheel onderhoud" listed as a unit.
- **Built:** seeded as a unit in category Overig without make, model or location.
- **Why:** §2.6 "Data quirk"; the seed copies the mockup.

#### 74. Import of the client's register

_Not yet, high impact._

- **Mockup:** the client's own tags (BES-3, TDTE-13, ING-19).
- **Built:** demo data only; no import from My24Service.
- **Why:** §5 "Import from My24 … a phase of its own"; §7 "Not built yet".

### Klantkaart (mockup `/klant`, built: /customers/<code>)

#### 75. A card per customer at `/customers/<code>`

_Changed, medium impact._

- **Mockup:** one static card, header title "Klantkaart — Riedel B.V.".
- **Built:** `/customers/CUST-0001`: breadcrumbs "Klanten › Riedel B.V.", title "Riedel B.V.", description "CUST-0001 · Ede, Nederland", segment badge "Grootzakelijk", buttons "Bewerken" and delete.
- **Why:** consistency with the app; customer codes and segments are Fieldworks' fields.

#### 76. Address card with photo and tabs left out

_Changed, medium impact._

- **Mockup:** card "Riedel B.V." with tabs "Adres" / "Information", a building photo, "Riedel B.V., Frankeneng 12, 6717AG Ede".
- **Built:** no photo, no tabs; a "Contactpersoon" card (contact, e-mail, phone, place, klant sinds) and a "Vestigingen" card with each site's address.
- **Why:** no file storage for photos (§5 "Photos … wait for file storage"); sites are records (phase 0).

#### 77. Sites with visit preferences and access notes

_Added, medium impact._

- **Mockup:** not on the card.
- **Built:** "Vestigingen · Waar de apparatuur van … staat, en hoe je er langskomt": per site the address, contact on site, "Contact via", "Voorkeursdag", "Tijdvak", "Prioriteit", "Toegangsinstructies", its locations; add/edit/delete a site.
- **Why:** §5 "Decided for phase 0": preferences and access notes belong to the site.

#### 78. "Log" became separate activity cards

_Changed, medium impact._

- **Mockup:** "Log" of order events with tones: "opdracht gecopieerd vanuit shltr-installation", "Opdracht gewijzigd door SHLTR Installation …", "Opdracht toegewezen aan Weggemans01", "order accepted".
- **Built:** three things: "Recente activiteit" (the latest orders), "Activiteitenlog" from Conditiebeheer (orders and work orders completed, conditions recorded) and an "Activiteit" card with the changes to the customer record. Order events (assigned, accepted) are in each order's activity and the activity log, not on the customer card.
- **Why:** §4.1 "Activity log: keep the audit log as is"; the service history is the condition module's.

#### 79. "opdracht gecopieerd vanuit shltr-installation" doesn't happen

_Changed, low impact._

- **Mockup:** orders copied from the customer's tenant to SHLTR's.
- **Built:** customers report directly in SHLTR's portal; there's no copying between tenants.
- **Why:** §5 "What My24Service tells us": one SHLTR tenant with a customer portal.

#### 80. "Werkbonnen" table replaced by recent orders

_Changed, medium impact._

- **Mockup:** "Werkbonnen": Werkbon (20510–20518), Apparatuur, Locatie, Datum, an external-link icon, one row highlighted in teal.
- **Built:** "Recente activiteit · De laatste opdrachten voor al hun apparatuur": order number, type, unit(s), status, total, "Afgerond/Gepland/Aangemaakt <date>", and "Alle N opdrachten". The work order ("Werkbon" PDF) is on each order's page, numbered by the order.
- **Why:** the work order is one per order (§5 "What My24Service tells us").

#### 81. "Order Types" chart left out

_Not yet, medium impact._

- **Mockup:** donut "Order Types" with legend and percentages (Storing 49,38 %, Reparatie 25 %, Storing prio 7,5 %, …).
- **Built:** none.
- **Why:** §4.1 calls it "a small core chart"; not built.

#### 82. Building facts left out

_Not yet, medium impact._

- **Mockup:** tiles Kantooroppervlak 1400 m², Zakelijke ruimte 2000 m², Parkeerplaatsen 48, m² gfa per werkstation / werknemer / FTE, Werkstation per medewerker / FTE.
- **Built:** none. Instead four tiles: "Open opdrachten", "Totale omzet", "Apparatuur" ("Alles werkt naar behoren" or the number needing attention), "Klant sinds".
- **Why:** §4.1 "Building facts = site fields"; not built.

#### 83. Documents "Techniek" and "Facilitair" left out

_Not yet, medium impact._

- **Mockup:** "Nieuw documenten - Techniek" (three PDFs on aerial platforms) and "Nieuw document - Facilitair" ("Geen documenten beschikbaar").
- **Built:** none.
- **Why:** no file storage; §5 question 19.

#### 84. Equipment table on the card

_Added, low impact._

- **Mockup:** no unit list on the card.
- **Built:** "Apparatuur" table: unit (name, make · serial), site and location, category, installed, status.
- **Why:** Fieldworks' customer page.

#### 85. Portal access, partner, docks and energy cards

_Added, medium impact._

- **Mockup:** none.
- **Built:** side cards "Portaaltoegang" (invite the customer's contacts to the portal), "Partner Bonus {year}" (level, figures, wallet; or a manager's button to accept the customer as partner), Docks and Energie for the customer's sites.
- **Why:** phase 4a (portal contacts invited from the customer's page), the partner programme and the docks and energy modules' `customers.detail.side` slot.

#### 86. "Laatst geopend" not tracked

_Left out, low impact._

- **Mockup:** dashboard "Klantkaart · Riedel B.V. — laatst geopend".
- **Built:** no recently-opened customers.
- **Why:** unknown.

#### 87. English labels gone

_Changed, low impact._

- **Mockup:** "Information", "Log", "Order Types" in English among Dutch.
- **Built:** everything in Dutch (or English when that language is chosen).
- **Why:** i18n rules.

### Visual style (mockup `styles.css`, built: Lagoon theme)

#### 88. Theme matches the mockup's palette

_Changed, low impact._

- **Mockup:** stock shadcn with Tailwind slate/teal classes; `#f6f7f9` page, white cards, teal-600/500 brand, slate text, 8px corners, flat 1px borders, system font.
- **Built:** the Lagoon theme (`src/lib/themes/lagoon.ts`) copies these as variables: grey page, white cards/sidebar/header, `--primary` teal-600, sidebar brand teal-500, accent teal-50/teal-700, slate neutrals, `--radius` 0.625rem, no card shadows, buttons `shadow-sm`, system font.
- **Why:** shltr-style.md.

#### 89. Primary buttons are teal

_Changed, low impact._

- **Mockup:** shadcn's default primary is slate-900 (dark buttons); the pages override some to teal ("Besteed Parts Credit").
- **Built:** every primary button is teal-600 with white text.
- **Why:** Lagoon (`--primary` teal-600).

#### 90. Section cards with a teal bar

_Changed, low impact._

- **Mockup:** header band with a teal "|" before a small semibold title.
- **Built:** every card with a header and content gets the band and a rounded teal bar before its title, plus a small grey description line under it (which the mockup doesn't have).
- **Why:** Lagoon `card-header`/`card-title`.

#### 91. Status badges: square 4px everywhere

_Changed, low impact._

- **Mockup:** 4px tinted badges for order status, but rounded-full pills for Planning's legend, Apparatuur's Staat and categories, and the count pills.
- **Built:** one badge shape (4px, 11px text, tinted by tone: emerald/amber/sky/rose/slate); legends use dots.
- **Why:** Lagoon `badge`, consistency.

#### 92. Page banners and coloured toolbars not built

_Left out, medium impact._

- **Mockup:** teal gradient banners (Connect, Dock, Energie, Werkbonnen) and solid teal toolbar bands (Planning, Apparatuur).
- **Built:** the plain page header everywhere.
- **Why:** shltr-style.md "What a theme can't do": to build as shared components when the pages need them; not done.

#### 93. Stat tiles, key-figure tiles, dark panel, filter chips, grouped-table badges, notices

_Left out, medium impact._

- **Mockup:** icon stat tiles; `border-l-2` teal key-figure tiles (Partner Level / Omzet); the dark slate-950 Wallet panel; rounded-full filter chips with counts; group rows with tinted category badges; amber/teal call-outs ("3 taken vervallen vandaag").
- **Built:** plain stat cards; filter menus; neutral group rows; the portal's notices use a teal-tinted box. (The partner pages may use their own figures; see that researcher's file.)
- **Why:** shltr-style.md "What a theme can't do" lists them; only some were built where pages needed them.

#### 94. Dark mode and other themes

_Added, low impact._

- **Mockup:** no usable dark mode.
- **Built:** Lagoon dark (slate-950 page, lighter slate cards, teal-500 brand, translucent badge tints) and five other themes, switchable in the header.
- **Why:** shltr-style.md "Dark mode"; the app's theme system.

#### 95. Table density and padding

_Changed, low impact._

- **Mockup:** `px-5 py-3` cells, slate-50 head row.
- **Built:** the same head styling (muted, `text-xs`, not uppercase) but the data tables' own density, with a Ruim/Compact toggle.
- **Why:** shltr-style.md "What to ignore".

#### 96. Icons differ

_Changed, low impact._

- **Mockup:** Lucide icons per nav item (e.g. Klanten users, Apparatuur wrench, Docks truck).
- **Built:** Lucide icons of the app's own choice (Klanten building-2, Apparatuur cog, Docks warehouse, Monteurs hard-hat, Shop shopping-cart).
- **Why:** shltr-style.md "What to ignore": icon choices.

#### 97. Page width

_Changed, low impact._

- **Mockup:** dashboard and Klantkaart centred at max 1400px.
- **Built:** pages use the full width beside the sidebar.
- **Why:** consistency with the app.

### SHLTR Connect (mockup `/connect`, built: /condition)

#### 98. Page and menu name

_Changed, medium impact._

- **Mockup:** sidebar "SHLTR Connect", page "SHLTR Connect — onderdelenbeheer per klant" in a teal banner with the intro "Alle klanten, onderdelen, voorkeuren en activiteiten staan nu in de centrale database van Connect…"
- **Built:** sidebar and page "Conditiebeheer" (nl) / "Connect" (en) at `/condition`, with the description "Conditie, keuring en service van alle apparaten in beheer, de slechtste eerst." and a plain page header (no banner, no intro copy)
- **Why:** unknown (most likely: modules are generic for every tenant, so they carry no SHLTR brand; the Dutch label describes the function)

#### 99. Components became units (no component register)

_Changed, high impact._

- **Mockup:** every row is a component ("onderdeel", e.g. a spring set) of a piece of equipment, with its own code (`OC-…`), article number ("art. SD-001"), condition, inspection and status; KPI "Onderdelen in beheer"
- **Built:** every row is a unit of equipment (title plus serial number); KPI "Apparaten in beheer"; condition, inspection and status are per unit; there is no component table and no code or article number per row
- **Why:** user decision, Doc §5 "What My24Service tells us": "Condition per unit, no component table: parts used come from the unit's order lines"

#### 100. Article number / link to the parts shop per row

_Left out, medium impact._

- **Mockup:** "Koppelen: elk onderdeel is gekoppeld aan apparatuur, locatie en klant, met artikelnummer uit de Onderdelen Shop"; the row shows "code · art. SD-001"
- **Built:** no article number on the Connect row; the parts used are listed on the unit's page (materials card, from its orders' lines: "Gebruikte onderdelen staan bij de opdrachten van het apparaat"); advice text may name a SKU in free text (seed: "Veerpakket vervangen (SD-001)…"); a rejected checklist point suggests its part from the parts shop
- **Why:** follows from the per-unit decision (Doc §5)

#### 101. Every unit is "in care"

_Changed, medium impact._

- **Mockup:** only the components registered in Connect are listed (Connect is sold as an add-on product, Doc §1)
- **Built:** every unit of every customer that isn't decommissioned is listed, also those never given a condition (bar "Niet vastgelegd"); no per-customer or per-unit opt-in to Connect; the module is on or off for the whole tenant
- **Why:** technical/consistency (module switch per tenant); a per-customer product isn't modelled — unknown whether intended

#### 102. Process banner (4 steps) left out

_Left out, low impact._

- **Mockup:** four cards "1. Koppelen", "2. Monitoren", "3. Plannen", "4. Uitvoeren & vastleggen" explaining the flow
- **Built:** none
- **Why:** unknown (explanatory copy, not a function)

#### 103. Condition score: entered, not computed

_Changed, high impact._

- **Mockup:** "Conditiescore op basis van cycli, storingsmeldingen en bevindingen uit werkbonnen" (claimed, never computed; a stored value)
- **Built:** a score 0–100 plus advice is recorded by hand: in the office ("Conditie vastleggen" on the unit's page) or by the engineer on the engineer portal once the unit's checklist is completed ("De werkbon is afgerond. Hoe staat het apparaat ervoor?"). No cycle counters or formula
- **Why:** open question Doc §5 Q12 (entered, computed or from sensors?) still unanswered; manual entry is the fallback

#### 104. Condition history per unit

_Added, medium impact._

- **Mockup:** one current value per component
- **Built:** every recording is kept; the unit's page has a "Conditie" card with the latest score, the status badge and "Verloop" (the history, with source Werkbon/Kantoor, who, when, order)
- **Why:** the latest counts, history is kept (commit 4b391530)

#### 105. Status rules

_Changed, high impact._

- **Mockup:** "Kritiek: Conditie onder 40% of keuring verlopen — binnen 5 werkdagen inplannen"; "Aandacht: Slijtage of bevinding vastgelegd"; "Gepland: Onderhoud staat in de Planning, onderdelen zijn gereserveerd"; "In orde: Binnen interval en keuring geldig"
- **Built:** derived, never stored: Kritiek = score below 40 or inspection expired; Aandacht = score below 70, or the latest inspection rejected a point, or open advice; Gepland = an open order on the unit is scheduled or in progress (any type), whatever the concern; else In orde. Legend: "Conditie onder {attention}%, een afkeurpunt of open advies — meenemen bij de eerstvolgende beurt."; "Onderhoud staat in de planning; het teken ernaast zegt wat het apparaat nodig heeft."
- **Why:** Doc §3.3 derivations; Doc §5 "Decided" ("A rejected point makes the unit Aandacht; an expired inspection makes it Kritiek")

#### 106. "Gepland" keeps the underlying concern

_Added, medium impact._

- **Mockup:** "Gepland" badge only
- **Built:** a planned unit shows "Gepland" with a small marker for what is behind it ("Onderliggend: Kritiek"), and sorts critical-planned before ok-planned
- **Why:** Doc §2.3 open question "does a planned visit hide a critical state?" answered by showing both

#### 107. "Gepland" no longer means parts reserved

_Changed, low impact._

- **Mockup:** "…onderdelen zijn gereserveerd"
- **Built:** Gepland only means an order is scheduled or under way; nothing about parts
- **Why:** unknown (parts reservation isn't tied to the status)

#### 108. Only a maintenance checklist's rejection doesn't flag the unit

_Changed, medium impact._

- **Mockup:** finishing any work order with an Afkeur sets the component to "Aandacht nodig"
- **Built:** only the latest completed inspection (Keuring) checklist's rejections make a unit "Aandacht"; Afkeur points on a maintenance (Onderhoud) checklist do not change the status, unless the engineer records a low score or advice
- **Why:** inspection status is derived from inspections only (`inspectionSql`); unknown whether intended

#### 109. Thresholds are a setting

_Added, low impact._

- **Mockup:** fixed 40 / 70 (bar colours and legend)
- **Built:** settings page `/condition/settings` (owners and admins): "Kritiek onder (%)" (40) and "Aandacht onder (%)" (70); the legend and bar colours follow them. The 5 working days and the 30 days "Bijna verlopen" are fixed
- **Why:** Doc §4.2 components settings

#### 110. Planning critical units automatically

_Added, medium impact._

- **Mockup:** only text ("binnen 5 werkdagen inplannen", "verlopen keuringen krijgen voorrang in de Planning"); nothing happens
- **Built:** setting "Kritieke apparaten automatisch inplannen" (off by default): a daily job gives each critical unit without an open order a maintenance order, status "Nieuw", priority high, description "Kritieke conditie (22%): inplannen vóór <date>. <advice>" or "Keuring verlopen: inplannen vóór <date>.", due within 5 working days (Mon–Fri, no holidays); the settings show the last run. Expired inspections get no other priority on the planning board
- **Why:** Doc §4.1 / §4.2; Doc §5 Q13 (auto or flag) answered with an opt-in setting

#### 111. Inspection statuses

_Changed, medium impact._

- **Mockup:** column "Keuring" with "Geldig", "Bijna verlopen", "Verlopen" (stored)
- **Built:** derived from the unit's latest completed inspection checklist: "Geldig", "Bijna verlopen" (last 30 days), "Verlopen", plus "Afgekeurd" (rejected a point) and "Geen" (never inspected); validity per checklist template (12 months by default, SHLTR's "Algemene inspectie" 6 months). The column only shows with the checklists module on
- **Why:** Doc §5 Decided ("An inspection is valid 12 months by default, set per template"); Doc §3.3

#### 112. "Laatste" and "Volgende" sources

_Changed, low impact._

- **Mockup:** stored `laatste_onderhoud` / `volgende_onderhoud` per component; "Onderhoudsinterval bepaalt de volgende beurt"
- **Built:** "Laatste beurt" = the completion date of the unit's latest done order (any type); "Volgende" = the next due day of the unit's maintenance plan (only with the maintenance module on; hidden otherwise)
- **Why:** Doc §4.1 (maintenance plans hold the interval at unit level)

#### 113. Table columns

_Changed, low impact._

- **Mockup:** Onderdeel (name, code · art., advice underneath) · Apparatuur / locatie · Klant · Conditie · Laatste · Volgende · Keuring · Status
- **Built:** Apparaat (title, serial number) · Locatie (location record + site) · Klant (link) · Conditie (bar + %) · Laatste beurt · Volgende · Keuring · Status · Advies (own column); columns can be hidden, sorted, remembered per member; units, locations and customers link to their pages
- **Why:** consistency with the app's other lists; per-unit model

#### 114. Worst first, search, filters, paging

_Added, low impact._

- **Mockup:** ordered by code; customer chips and one checkbox only
- **Built:** sorted worst first by default (status, then underlying concern, then lowest score); search "Zoek apparaten…"; faceted filters Status, Conditie (Laag/Matig/Goed/Niet vastgelegd) and Klant; server-side paging with infinite scroll; state in the URL
- **Why:** consistency with the app's server-side lists (`docs/agents/lists.md`)

#### 115. KPI tiles filter the list

_Added, low impact._

- **Mockup:** five static tiles
- **Built:** same five tiles ("Apparaten in beheer", "Kritiek", "Aandacht nodig", "Onderhoud gepland", "In orde"); each status tile has "Bekijken" to filter the table to it
- **Why:** consistency with the app

#### 116. Customer chips

_Changed, low impact._

- **Mockup:** "Alle klanten" with the total count, then a chip for every customer with its count
- **Built:** "Alle klanten" (no count), then the 10 customers with the most units (plus the chosen one) with counts; any customer through the Klant filter
- **Why:** scale (many customers)

#### 117. Customer panel on choosing a customer

_Left out, medium impact._

- **Mockup:** picking a customer shows three cards: "Klantgegevens" (Vestiging, Contact, E-mail, Telefoon, Contract), "Voorkeuren" (Contact via E-mail/Telefoon/WhatsApp/Portaal, Voorkeursdag, Tijdslot, Prioriteit, notitie) and "Laatste activiteiten" (5)
- **Built:** no panel on the Connect page. Contact details are on the customer page; the preferences (Contact via, Voorkeursdag, Tijdslot, Prioriteit, access notes) are per site in the customer's sites card; the access notes also show to the engineer on the portal ("Toegang"); the contract is in the contracts module; the service history is on the customer page (10 entries)
- **Why:** user decision, Doc §5 "Decided for phase 0": "Contact preferences and access notes belong to the site, not the customer"

#### 118. Activity log placement and contents

_Changed, medium impact._

- **Mockup:** "Activiteitenlog" always visible at the bottom (12 latest, filtered by customer): date, soort, omschrijving, uitgevoerd_door; soorts Onderhoud, Melding, Storing, Advies, Inspectie, Keuring
- **Built:** button "Activiteitenlog" opens a side sheet (12 latest, for the chosen customer or all); built from the records: completed orders ("Storing afgerond", soort = order type), completed checklists ("Werkbon keuring 2026 afgerond · 2 afkeurpunten", soort Keuring/Onderhoud), recorded conditions ("Conditie vastgelegd: 22%", soort Conditie or Advies); each names its units (links), the customer and "door <name>"
- **Why:** Doc §4.1 suggested its own event table; built from existing records instead (commit 4b391530, `feed.ts`)

#### 119. No "Melding" entries until the work is done

_Changed, low impact._

- **Mockup:** soort "Melding" (a report) appears in the log
- **Built:** the feed lists completed orders only, so a reported breakdown shows in the log once completed, not when reported
- **Why:** feed built from completed records (`feed.ts`)

#### 120. Legend placement

_Changed, low impact._

- **Mockup:** "Wat betekenen de statussen?" always visible at the bottom
- **Built:** same title, a folded panel at the top, opened on click; texts use the tenant's thresholds
- **Why:** keep the list in view (component comment)

#### 121. Connect elsewhere in the app

_Added, medium impact._

- **Mockup:** only the Connect page
- **Built:** the dashboard tile "Apparaten met aandacht" ("{n} kritiek · {n} aandacht", links to the filtered page); condition and status columns in the equipment list; the unit page's condition card; the customer page's service history
- **Why:** Doc §4.2 extension points

#### 122. Connect in the customer portal

_Added, medium impact._

- **Mockup:** office page only
- **Built:** the customer portal's home shows "Apparaten die aandacht nodig hebben" (the customer's critical and attention units, with site and advice); unit pages show inspection status and history
- **Why:** Doc §5 "Decided in phase 4a" (customer portal); Doc §1 ("later perhaps their own Connect")

#### 123. Who can do what

_Changed, low impact._

- **Mockup:** anyone; read-only page
- **Built:** every office member reads and may record a condition; owners/admins change the settings; engineers record a condition only on their own in-progress order after the unit's checklist is done; customers' contacts see only their own attention units
- **Why:** tenancy gates (`forMembers`, `forManagers`, `forEngineers`, `forCustomers`)

### Werkbonnen (mockup `/werkbonnen`, built: checklists on orders)

#### 124. No "Werkbonnen" page; menu item is "Checklists" (templates)

_Changed, high impact._

- **Mockup:** sidebar "Werkbonnen" → page "Digitale checkpoint-werkbon" ("Per asset een vaste checklist voor keuring en onderhoud. Elk jaar start een nieuwe lijst; eerdere bonnen blijven bewaard.") with an asset list on the left and the checklist on the right
- **Built:** sidebar "Checklists" opens "Checklistsjablonen" (`/checklists/templates`). Checklists live on orders: filled in on the engineer portal, read on the order page (office), printed as "Werkbon {nummer}" (`/checklists/work-orders/<number>`), history on the unit's page, results in the customer portal
- **Why:** user decision, Doc §5 "Decided": "Checklists: one per unit per order"; Doc §4.2 checklists module
- **Now:** sidebar "Werkbonnen" → "Digitale checkpoint-werkbon" at `/checklists`, the mockup's two columns: the asset list, and the selected unit's checklist of this year with "Historie per jaar"; checklists stay one per unit per order.

#### 125. Naming: checklist vs werkbon

_Changed, medium impact._

- **Mockup:** the per-asset checklist is the "werkbon" ("Werkbon Keuring 2026")
- **Built:** the per-unit list is a "Checklist" ("Checklist afronden"); "Werkbon" is the printable document of a whole order, covering all its units' checklists and signatures
- **Why:** consistency with orders and My24Service ("the work order is one PDF per order", Doc §5)
- **Now:** the page and its card say "Werkbon Keuring 2026" as the mockup does; elsewhere a unit's list is still a "Checklist" and "Werkbon {nummer}" the printed order.

#### 126. Asset list with search and year badge

_Left out, medium impact._

- **Mockup:** "Zoek asset…" over code/apparatuur/onderdeel; each asset with "2026 ✓" (completed this year) or "2026 open"
- **Built:** no such list. Nearest: the equipment list's "Keuring" column (Geldig/Bijna verlopen/Verlopen/Afgekeurd/Geen keuring, with "valid until", sortable and filterable)
- **Why:** checklists hang on orders, not on a yearly per-asset list (Doc §5 Decided)
- **Now:** the work orders page lists every unit in service with a template, its components under it with their score, with "2026 ✓" / "2026 open" (open: a draft on an open order); "Zoek asset…" searches unit, serial, component and customer on the server, with filters by customer and by this year's state.

#### 127. Per unit (apparaat), not per component

_Changed, medium impact._

- **Mockup:** a checklist per component row ("Sectionaaldeur laaddok 07 — <onderdeel>")
- **Built:** a checklist per unit on an order; an order with several units has one per unit
- **Why:** Doc §5 Q10 answered in "Decided": one per unit per order; "An order covers one or more units"

#### 128. Starting a checklist

_Changed, high impact._

- **Mockup:** on an asset, buttons "Keuring 2026" / "Onderhoud 2026" start a new checklist at once; "Voor 2026 is nog geen werkbon ingevuld. Start een nieuwe checklist."
- **Built:** no start button. An order of type Inspectie or Onderhoud (made by the office, or by a maintenance plan's daily job, or by the condition module's auto-planning) gets a checklist for each of its units whose category has a template, while it's Nieuw/Ingepland/In behandeling; the kind follows the order type. "Every year a new list" happens through maintenance plans, not through a yearly reset
- **Why:** Doc §5 Decided; Doc §6 phase 1 ("A checklist per inspection/maintenance order")
- **Now:** "Keuring 2026" / "Onderhoud 2026" on the page make an inspection or maintenance order for the unit (Nieuw, unscheduled, no engineer), whose checklist comes by the rule above, or open the unit's open order of that kind; with "Voor 2026 is nog geen werkbon ingevuld. Start een nieuwe checklist."

#### 129. Template choice by category

_Changed, medium impact._

- **Mockup:** picked by keyword in name ("sectionaal", "airco", "level/dock/chock", "trap/bordes", else "Algemene inspectie")
- **Built:** by the unit's equipment category; a category has at most one template; a unit whose category has none gets no checklist. SHLTR seed: Sectionaaldeuren and Snelroldeuren → Sectionaaldeur; Airco / koeltechniek → Airco; Docklevellers and Salvo docks → Dockleveller / Salvo dock; Klim- & trapmateriaal → Bordes / trap; Branddeuren, Automatische deuren, Hoogwerkers, Overig → Algemene inspectie
- **Why:** Doc §4.2 ("by equipment category, not the mockup's keyword match"); Doc §5 Decided

#### 130. Template label

_Changed, low impact._

- **Mockup:** "Sectionaaldeur (NEN-EN 12604/12453)", "Airco / koeltechniek (F-gassen)"
- **Built:** name and norm apart: "Sectionaaldeur · NEN-EN 12604/12453 · Keuring"; "Airco / koeltechniek · F-gassen"; leveller and general templates have no norm. The 34 points are verbatim
- **Why:** templates have a norm field

#### 131. Templates are editable

_Added, medium impact._

- **Mockup:** five fixed templates in code
- **Built:** owners/admins manage templates: name, norm, "Keuring geldig (maanden)", equipment categories, points in groups (add, edit, reorder points and groups, delete), retire and restore ("Buiten gebruik"); a card "Categorieën zonder sjabloon"; the unit page shows its template. A checklist copies its template, so later edits don't change it
- **Why:** Doc §5 Decided ("the tenant edits its own")

#### 132. Inspection validity per template

_Added, medium impact._

- **Mockup:** a keuring just sets "Geldig"; no end date
- **Built:** completing an inspection checklist makes the unit valid until completion date + the template's months (12 by default; SHLTR's "Algemene inspectie" 6); shown as "Geldig tot <date>" on the work order and unit page; "Bijna verlopen" in the last 30 days
- **Why:** Doc §5 Decided (12 months by default, per template)

#### 133. Who fills it in, where

_Changed, high impact._

- **Mockup:** any user at a desktop page; "Monteur" is a free-text field, default "Lev"
- **Built:** only the engineer assigned to the order, on the engineer portal (phone layout, large buttons), and only after "Klus starten" (order In behandeling): "{nummer} is niet in behandeling: de checklists kun je niet wijzigen." The engineer is the order's engineer; no free-text field. The office can only read
- **Why:** Doc §4.1 ("monteur becomes the order's engineerId"); Doc §6 phase 1 ("filled in on the engineer portal")
- **Now:** office members also fill a draft in on the work orders page, for the engineer (paper forms brought back), on any open order, by the same rules and autosave, with the mockup's progress bar and "Afronden & vastleggen"; it's recorded as "Afgerond door {naam} (kantoor)" (no engineer). Still no free-text monteur field.

#### 134. Answer buttons and remark

_Changed, medium impact._

- **Mockup:** "Goed" / "Afkeur" / "N.v.t."; on Afkeur an optional field "Omschrijf afwijking / benodigd onderdeel…"
- **Built:** same three labels and placeholder; the remark is required with Afkeur: "Omschrijf wat er mis is, of welk onderdeel nodig is." / "Bij 1 afkeurpunt staat niet wat er mis is."
- **Why:** unknown (app rule `isAnswered`)

#### 135. Saving: autosave instead of concept / cancel

_Changed, medium impact._

- **Mockup:** "Concept opslaan" (status Concept), "Verder invullen" on a concept in the history, "Annuleren" discards
- **Built:** every answer and remark is saved as it's given ("Wordt meteen opgeslagen.", "Opslaan…"); a draft stays until completed; no save or cancel button; reopening is just opening the order again
- **Why:** field use on a phone (component comment)

#### 136. Progress

_Changed, low impact._

- **Mockup:** "B/V punten" with a teal progress bar
- **Built:** "{answered}/{total} punten" text, no bar
- **Why:** unknown

#### 137. Completing

_Changed, low impact._

- **Mockup:** "Afronden & vastleggen", disabled until every point has an answer
- **Built:** "Checklist afronden" is always clickable and says what's missing; it requires every point answered and every Afkeur explained; afterwards the checklist is final and isn't changed again ("De checklist van {unit} is al afgerond.")
- **Why:** app rules (`canComplete`)

#### 138. The order can't be completed before its checklists

_Added, medium impact._

- **Mockup:** no link between werkbon and an order
- **Built:** "{nummer} kan nog niet worden afgerond: de checklist van {units} is niet afgerond."; also, once a checklist has answers, the order can't change type, drop that unit or be deleted
- **Why:** Doc §4.2 (`orders.saving` hook)

#### 139. Signatures of engineer and customer

_Added, high impact._

- **Mockup:** no signature
- **Built:** "Klus afronden" needs the customer's name and signature ("Vraag de klant te tekenen") and the engineer's name and signature ("Teken de werkbon ook zelf"); both print on the work order ("Monteur" / "Klant")
- **Why:** Doc §5 Decided ("Engineer and customer both sign"), My24Service requires both

#### 140. Condition after completion

_Added, medium impact._

- **Mockup:** completing doesn't touch the condition
- **Built:** under a completed checklist the engineer is asked "De werkbon is afgerond. Hoe staat het apparaat ervoor?": a score (%) and advice, recorded on the unit (feeds Connect)
- **Why:** Connect's input (commit 4b391530; Doc §2.3 notes the mockup never updates condition)

#### 141. What completing writes

_Changed, low impact._

- **Mockup:** inserts an activity "Werkbon keuring 2026 afgerond · n afkeurpunt(en)" / "… · alles in orde", sets the component's laatste_onderhoud = today, status "Aandacht nodig"/"In orde", keuring "Afgekeurd"/"Geldig" (values Connect doesn't know: a mockup bug)
- **Built:** nothing is stored on the unit; status and inspection are derived (consistent values); the Connect log shows "Werkbon keuring 2026 afgerond · 2 afkeurpunten" or "· alles in orde"; "Laatste beurt" follows the order's completion, not the checklist's; the audit log records it against the order
- **Why:** Doc §2.7 "Bugs and inconsistencies to fix, not copy"

#### 142. Rejected point suggests a part

_Added, medium impact._

- **Mockup:** none ("benodigd onderdeel" only as free text)
- **Built:** on the order page (office) and in the customer portal, a rejected point offers the part the parts shop links to that checkpoint, to add to the order or order in the shop
- **Why:** Doc §4.2 ("a nok point's suggested SKU"); commit 1656fdd5

#### 143. History per year

_Changed, low impact._

- **Mockup:** "Historie per jaar" below the checklist: per year, expandable entries "soort · monteur", date, badge "Concept" / "n afkeur" / "Goedgekeurd", all points with result and remark, general remark
- **Built:** on the unit's page, card "Keuringen en onderhoud": inspection badge and "Geldig tot …"/"Verlopen op …"/"Nog geen afgeronde keuring.", then per year: kind · date, engineer, outcome badge (same three badges); a click opens a dialog with the points, remarks and a link to the order
- **Why:** per-unit, per-order model

#### 144. Print / PDF

_Changed, medium impact._

- **Mockup:** "PDF" = print the page (one asset's history)
- **Built:** "Werkbon" button on the order → A4 page "Werkbon {nummer}" with organisation, type, status, date, engineer, customer and contact, site address, a units table with outcome, each checklist under its groups with "Afgerond door … op …" and "Geldig tot …", and both signatures; "Afdrukken" prints it. No per-unit history printout
- **Why:** Doc §4.2 print route; My24Service ("one PDF per order")

#### 145. Results for the customer

_Added, medium impact._

- **Mockup:** none
- **Built:** the customer portal shows each order's checklists with outcome, points and the remark for the customer, the work order to print once done, and each unit's inspection status and completed checklists
- **Why:** Doc §5 "Decided in phase 4a"

#### 146. Several per year

_Changed, low impact._

- **Mockup:** "Elk jaar start een nieuwe lijst" (year field; several allowed in code)
- **Built:** no year field; one checklist per unit per order, any number of orders; history grouped by year of the date
- **Why:** per-order model

#### 147. Status labels

_Changed, low impact._

- **Mockup:** "Concept", "Afgerond"
- **Built:** "Concept", "afgerond" (lower case in running text); outcome "Goedgekeurd" / "{n} afkeur"
- **Why:** unknown

#### 148. QR codes to reach the unit

_Added, medium impact._

- **Mockup:** none
- **Built:** each unit and location has a QR code (label sheets on A4); scanning opens the unit on the engineer portal with "Je open opdrachten hier", the office page for office users, or the breakdown report for customers
- **Why:** Doc §5 "What My24Service tells us" (locations and units with QR codes)

### Salvo Docks (mockup `/dock`, built: /docks)

#### 149. Page and menu name

_Changed, low impact._

- **Mockup:** sidebar "Salvo Docks"; page "Salvo · Dock Time Management", banner "Salvo systeem · live", title "Dock Time Management" with the intro "Per dock zichtbaar of de vrachtwagen vergrendeld is met de Wheel-Lok…"
- **Built:** sidebar and title "Docks" with a "Live" badge; description "<klant> — <vestiging> · Salvo koppelt de vergrendeling aan de deursturing: de deur gaat pas open als de wielblokkering actief is."
- **Why:** unknown (generic module names)

#### 150. Real data from a Salvo feed instead of static data

_Changed, high impact._

- **Mockup:** four hard-coded docks; only the timers count
- **Built:** each dock's state comes from events (check_in, lock, unlock, door_open, door_close, key_moved, scp_fault, scp_ok, check_out) posted to `POST /docks/ingest` with a tenant token; the board updates live when events arrive and timers count in the browser
- **Why:** Doc §4.2 docks module; commit 460e220c

#### 151. The real Salvo integration

_Not yet, high impact._

- **Mockup:** presented as live Salvo data
- **Built:** the feed contract is Fieldworks' own (`src/modules/docks/docs/salvo-events.md`); nothing connects to Salvo's actual API yet; an adapter is still needed
- **Why:** Doc §5 Q16 open (is there a Salvo API?); Doc §7 "Not built yet: the real Salvo … integrations"

#### 152. Simulator

_Added, low impact._

- **Mockup:** none (timer only)
- **Built:** a developer script (`pnpm docks:simulate`, with `--escalate` for the 60-minute rule) that posts made-up event streams for DOCK 05–08 so the demo board moves; not available in the UI
- **Why:** demo without hardware (Doc §6 phase 5, "a manual or simulated event feed")

#### 153. Integration tokens (settings page)

_Added, low impact._

- **Mockup:** none
- **Built:** "Salvo-koppeling" settings (owners/admins): "Koppelingstokens" with name, created, last used, "Nieuw token" (shown once, "Kopieer het token nu"), "Intrekken"; and a list of all docks (Dock, Klant, Vestiging, Salvo)
- **Why:** per-tenant authentication of the feed (Doc §4.2)

#### 154. Docks are configured per customer site

_Added, medium impact._

- **Mockup:** fixed docks, no customer or site named
- **Built:** managers add/edit/delete docks on the customer page ("Docks" card: "Dock toevoegen"): site, code ("DOCK 05"), position ("P-05 · Expeditie noord"), location, door unit, leveller unit, SCP panel, key id, Key Storage unit ("Laat de SCP leeg voor een dock zonder Salvo."); the board has a site switcher when several sites have docks
- **Why:** Doc §3.4 / §4.2 (dock position per site, linked to door and leveller)

#### 155. Docks without Salvo

_Added, low impact._

- **Mockup:** all four docks have Salvo
- **Built:** docks without an SCP are listed apart, "Docks zonder Salvo (geen live status)"; a Salvo dock that hasn't reported shows "Nog geen events"
- **Why:** a site has more docks than Salvo ones (seed: DOCK 01–04)

#### 156. States are derived

_Changed, low impact._

- **Mockup:** stored per dock: "Laden", "Bezet", "Vrij", "Storing"
- **Built:** same four labels, derived: Storing when the SCP is offline, Laden when the Wheel-Lok is on, Bezet when a truck is checked in but not locked, else Vrij
- **Why:** Doc §3.4 (live state from the integration)

#### 157. Beacon derived from the state

_Changed, low impact._

- **Mockup:** beacon stored per dock, blinking lamp: "Rood — niet betreden", "Oranje — wacht op vergrendeling", "Groen — veilig laden", "Uit — dock vrij"
- **Built:** same four labels, shown as a static coloured dot, always following the state (Storing → red, Laden → green, Bezet → orange, Vrij → off); not a value Salvo reports
- **Why:** simplification (`beaconOf()`); unknown whether Salvo reports the beacon itself

#### 158. Dock illustration left out

_Left out, medium impact._

- **Mockup:** each card has a drawing: sectional door that opens, a three-lamp traffic light, the truck ("AMEX") driving in or out, a blinking Wheel-Lok indicator, "SALVO" tag
- **Built:** text only
- **Why:** unknown

#### 159. Card layout and fields

_Changed, low impact._

- **Mockup:** big cards two per row; three tiles "Vergrendeling" (Wheel-Lok actief / Niet vergrendeld / Geen voertuig), "Deur open" (timer or Gesloten), "Positie" (Vrij / Bezet · kenteken); a list "Vervoerder", "Order", "Tijdslot", "Sectionaaldeur: Geopend/Gesloten"
- **Built:** compact cards four per row: code, position, state badge; a line "Wheel-Lok actief"/"Niet vergrendeld" with "Deur open 0:18:00"/"Deur dicht"; "carrier · plate" and "reference · Gepland 09:30–10:15", or "Geen vrachtwagen"
- **Why:** consistency with the app's cards

#### 160. Time slot for a free dock

_Left out, medium impact._

- **Mockup:** every dock has a planned slot "Tijdslot", even a free one (DOCK 07: "11:00 – 11:40")
- **Built:** a slot only comes with a truck's check-in event; no planned/booked slots per dock
- **Why:** no dock planning in scope; slot only from the feed's check-in payload

#### 161. The "Order" reference

_Changed, low impact._

- **Mockup:** "Order WB-20416"
- **Built:** the session's reference as free text, not linked to an order in the app
- **Why:** Doc §2.4 infer ("a load or visit record, not a service order")

#### 162. Per-dock remark replaced by generated warnings

_Changed, low impact._

- **Mockup:** a free-text note per dock ("Wheel-Lok actief, sleutel in SCP — laadproces loopt.", "Sleutel in Key Storage — beschikbaar voor volgende aanmelding.", "SCP meldt sleutelfout: sectionaaldeur reageert niet op sluitcommando.")
- **Built:** only warnings, generated: "Vrachtwagen aan het dock zonder Wheel-Lok: deur niet openen.", "Storing: de SCP reageert niet. Dock niet betreden tot het verholpen is.", "Deur 40+ minuten open: energieverlies en tocht, de dockplanner krijgt een melding.", "Deur 60+ minuten open: mogelijke storing aan de sectionaaldeur, er komt een storingsopdracht."; nothing for a dock that's fine
- **Why:** derived from the feed

#### 163. Salvo Safety System block

_Changed, low impact._

- **Mockup:** "Salvo Safety System": "Control Panel SCP-05 · Online" / "Sleutelfout"; "Salvo-sleutel SLV-K05 · Vast in SCP · Key Storage KS-NOORD-1"; Beacon
- **Built:** "Salvo-veiligheid": "SCP SCP-05 online" / "SCP SCP-08: sleutelfout" (always this text, whatever reason the SCP gives), "Sleutel SLV-K05: Vast in SCP / Bij chauffeur / In Key Storage", "Key Storage KS-NOORD-1", beacon
- **Why:** same data

#### 164. Components explanation card left out

_Left out, low impact._

- **Mockup:** "Salvo Safety System — componenten op de dock": Salvo Control Panel, Key Storage unit, Beacon with explanations, and "Het proces blijft ongewijzigd: aanmelden → vergrendelen → deur open → afmelden…"
- **Built:** none
- **Why:** unknown (explanatory copy)

#### 165. Process card

_Changed, low impact._

- **Mockup:** "Hoe Salvo de dock beveiligt", step 4 "…tijden worden vastgelegd op de werkbon"
- **Built:** "Zo verloopt een docksessie", step 4 "…de tijden worden vastgelegd op de sessie"; the signals are in the same card ("Signalen bij open deur")
- **Why:** the times go on a dock session, not on a service work order (Doc §2.4 infer)

#### 166. Sessions history

_Added, medium impact._

- **Mockup:** none
- **Built:** each dock lists its "Recente sessies" (check-in – check-out, plate, door open time or "aan het dock"); the door or leveller unit's page has "Dockgebruik" (sessions today, average door open over 30 days, open breakdown orders from the door rules)
- **Why:** Doc §3.4 dock session; Doc §4.2 `equipment.detail.side`

#### 167. KPIs

_Changed, low impact._

- **Mockup:** "Docks bezet n/total", "Vergrendeld", "Niet vergrendeld", "Deuren open", "Langste opentijd" over all docks
- **Built:** same five, counted over the Salvo docks that have reported; the board's timer always reads h:mm:ss ("0:23:40"), the mockup mm:ss below an hour ("23:40")
- **Why:** docks without data can't count

#### 168. 40-minute rule: notice to the dock planner

_Changed, medium impact._

- **Mockup:** "40–60 min: Energieverlies en tocht — melding naar de dockplanner" (text only)
- **Built:** the door turns amber and a notice is logged once per opening (activity log on the dock, and the board's "Meldingen" card for the last day: "Geen meldingen in het afgelopen etmaal."); no one is messaged; there is no dock planner role
- **Why:** Doc §5 Q16 ("Who is de dockplanner?") open

#### 169. 60-minute rule: breakdown order

_Changed, medium impact._

- **Mockup:** "> 60 min: Escalatie: mogelijke storing aan de sectionaaldeur, werkbon in SHLTR Connect" (text only)
- **Built:** the door turns red and a breakdown order (Storing, priority high, "DOCK 05: mogelijke storing aan de sectionaaldeur, deur 60+ min open") is made on the dock's door unit, at most one open per door; logged "Storingsopdracht {nummer} gemaakt". It's an order, not a Connect werkbon; the unit then shows Gepland in Connect once scheduled
- **Why:** Doc §4.2 docks rules; Doc §5 Q16 (should it open an order?) assumed yes

#### 170. SCP fault doesn't create an order

_Left out, low impact._

- **Mockup:** Storing shown with "sectionaaldeur reageert niet op sluitcommando"
- **Built:** an SCP fault sets Storing and the red beacon, but makes no order by itself
- **Why:** Doc §4.2 rules only name the 60-minute order

#### 171. Seeded demo differs from the mockup's sample

_Changed, medium impact._

- **Mockup:** DOCK 05 Laden AMEX 84-BNX-7 WB-20416 door 23:40; DOCK 06 Bezet AMEX 12-VDK-3 WB-20417 door open 44:40 (amber); DOCK 07 Vrij "P-07 · Dockstraat zuid", KS-ZUID-2; DOCK 08 Storing AMEX 51-JPR-9 WB-20419 door open 1:27:20 (red)
- **Built:** at Weggemans Logistiek, Barneveld: DOCK 05 Laden AMEX 84-BNX-7 WB-20416 door ~18 min; DOCK 06 Bezet "Van der Wal Logistiek VX-218-K WB-20419", door closed; DOCK 07 Vrij; DOCK 08 Storing ("Sleutelfout") without a truck or open door; all four "Expeditie noord", KS-NOORD-1; plus DOCK 01–04 without Salvo and a week of past sessions. So the seeded board shows no amber or red timer until the simulator runs
- **Why:** seed design (`server/seed.ts`); unknown why 06/08 differ

#### 172. Who sees it

_Changed, low impact._

- **Mockup:** one shell for everyone
- **Built:** office members see the board; owners/admins manage docks and tokens; engineers and customers' contacts don't see docks
- **Why:** tenancy gates

#### 173. Docks in the customer portal

_Not yet, medium impact._

- **Mockup:** n/a (but Doc §1 names dock reports as later customer-facing)
- **Built:** no portal page (energy has one)
- **Why:** Doc §5 Q16 ("a product SHLTR sells to customers or an internal monitoring tool?") open

#### 174. Docks on energy's door card

_Added, low impact._

- **Mockup:** none
- **Built:** a monitored door in the energy module that is a dock's door shows the dock's live state, with a link to the board
- **Why:** commit 184bcc0d (docks enhances energy)

### Energie (mockup `/energie`, built: /energy, portal)

#### 175. Real meter data instead of an in-page simulation

_Changed, high impact._

- **Mockup:** the page is a 30-day client-side P1 simulation starting 14 Sep 2026: a "P1 simulatie" bar with "Pauzeer"/"Start", reset ("Simulatie resetten"), speed buttons 1×/2×/5×/10×/30×, a clock "ma 14 sep · 08:00", "Dag N van 30 · 10 min per stap" (2 uur in month view), a progress bar, and a badge "simulatie 1×" / "gepauzeerd" in the header. Nothing is real except the alerts table.
- **Built:** the site page shows stored 15-minute readings per zone and door open/close events posted to `/energy/ingest` (`docs/ingest.md`). For the demo's SHLTR, a simulation in the app posts them through that same ingest (`server/live-simulation.ts`): the "P1 simulatie" bar with Start/Pauzeer, reset, 1×/2×/5×/10×/30×, and the banner's "simulatie N×" / "gepauzeerd". The clock is the real one: no simulated clock, day counter or progress bar; a higher speed makes it livelier (wider swings, more surges and door openings) instead of faster.
- **Why:** §4.2 `energy` ("the formulas of §2.5 with real data"); the demo's data is made up behind the real ingest, so only the source changes when the P1 link comes (`docs/plans/shltr-demo-todo.md` item 1).

#### 176. A demo simulator outside the page

_Added, medium impact._

- **Mockup:** the simulation is the page itself.
- **Built:** the seed gives Riedel Ede 30 days of history plus today up to seeding; the demo's simulation then posts every 15-minute interval since the latest reading on every tick (the Worker's minute cron, `/_ops/tick`, the page's bar every 5 s), so the history stays continuous and no zone but the external unit goes "Offline". `node src/modules/energy/server/simulator.ts` still posts a day to a running app with the demo token.
- **Why:** technical (keep the page on real data; a demo that never goes stale).

#### 177. Real P1 integration

_Not yet, high impact._

- **Mockup:** "Live P1-meter", "speel P1-data af".
- **Built:** only the generic ingest endpoint and integration tokens; the real source (P1 gateway, sub-meters per zone, door sensors) is unknown.
- **Why:** open question §5.17; §7 "Not built yet: the real Salvo and P1 integrations".

#### 178. A list of sites first, many customers

_Changed, medium impact._

- **Mockup:** one page, "Energie · Gebouw", for one building, "Riedel Ede — Productielocatie".
- **Built:** `/energy` lists every monitored customer site (cards with live kW, kWh today, zones/doors count, open-alert badge); each opens its own page `/energy/<site>`. The customer page has an "Energiemonitoring" card listing the customer's monitored sites.
- **Why:** SHLTR is the tenant and monitors many customers (§1 "Decided (A)"; §4.2 "site picker").

#### 179. Header and hero

_Changed, low impact._

- **Mockup:** a coloured hero "Energie Module" with chip "Riedel Ede", title "Energieprestaties per gebouwzone" and "Vergelijk perioden, speel P1-data af en zoom in tot op zone- en installatieniveau."
- **Built:** the mockup's teal banner (`#lib/components/hero-banner.svelte`): chips "Energie Module", the simulation's state (or "Live" / "Geen recente metingen" without a simulation) and the site's name, "Energieprestaties per gebouwzone" and its line, then "{klant}, {plaats} · laatste meting tot {tijd}"; breadcrumbs above it, and the buttons "Alerts", "Grenswaarden", "Energierapport" and (managers) "Instellen" in it. No "Exporteer PDF" on the page: "Energierapport" prints (#198).
- **Why:** the mockup's vibe (`docs/plans/shltr-demo-todo.md` item 2).

#### 180. Office setup of sites, zones, consumers and doors

_Added, medium impact._

- **Mockup:** zones, installations and doors are fixed demo data.
- **Built:** managers add an energy site for a customer site ("Energielocatie toevoegen", from `/energy` or the customer page) and keep its contract (gecontracteerde piek, kWh per jaar), zonnepanelen (kWp), tarief, CO₂-factor and time zone, and its zones (code, verdieping, m²), installaties (opgesteld vermogen, optional unit), and bewaakte deuren (soort, verlies kW, "Alert na (min)", binnen/buiten °C, optional unit) on `/energy/<site>/setup`. Deleting is refused once readings or alerts exist.
- **Why:** needed for real data (commit 184bcc0d).

#### 181. Integration tokens page

_Added, low impact._

- **Mockup:** none.
- **Built:** `/energy/settings` ("Energie-instellingen", "Koppeltokens"): managers create and revoke the tokens the gateways post with, and see each site's id and zone/door codes.
- **Why:** technical (authenticated ingest, `docs/ingest.md`).

#### 182. Period switch

_Changed, low impact._

- **Mockup:** "Vandaag vs. gisteren" / "Maand vs. vorige maand" toggle buttons.
- **Built:** "Vandaag" / "Deze maand" buttons (URL parameter `period`); comparisons read "t.o.v. gisteren" / "t.o.v. vorige maand" and compare like for like (yesterday up to the same time of day; last month as far in as this one). Without a full previous period no change is shown ("Nog geen vorige periode om mee te vergelijken").
- **Why:** real data; the mockup derived "previous" from a fixed delta per zone (`current / (1 + R/100)`).

#### 183. Scope selection

_Changed, medium impact._

- **Mockup:** buttons "Hele gebouw", "Begane grond", "1e verdieping", "Kelder"; clicking a zone in the floor plan or a table row selects it on the same page ("Selectie: <zone>"), and every panel follows.
- **Built:** buttons "Hele gebouw" and one per floor, and the floor plan's floor labels and zones, and the comparison's rows, select on the same page (URL parameter `scope`, keeping the scroll position), "Selectie: <naam>"; every panel follows but the floor plan and the live meter, which show the whole building as in the mockup. A selected zone's page (`/energy/<site>/zones/<code>`) is linked from the detail panel.
- **Why:** the mockup's behaviour; the zone pages stay for links.

#### 184. KPI tiles

_Changed, low impact._

- **Mockup:** six tiles, each with a "t.o.v. vorige periode" change: Actueel vermogen, Verbruik vandaag/deze maand, Piekvermogen (change shown as R × 0.72), CO₂-uitstoot, Actieve alerts, Verlies open deuren.
- **Built:** the same six tiles, with a change only where there is a real one (Verbruik, Piekvermogen, Verlies open deuren); the others show a detail instead: the number of zones, "bij 0,375 kg/kWh", "N open alerts". Verbruik and door loss also show their cost in euros. Piekvermogen is the highest measured peak in the period, not the zones' fixed peak.
- **Why:** real data; the mockup's changes were derived from one fixed figure.

#### 185. Building overview layout and zone tone

_Changed, medium impact._

- **Mockup:** "Gebouwoverzicht — Riedel Ede" as a stylised floor plan (1e verdieping on top, Begane grond with Expeditie & Docks full-width, Kelder at the bottom), each zone a coloured-bordered button with a pulsing dot, kW and kWh; a legend Nominaal/Verhoogd/Piekbelasting/Offline. The tone is a fixed property of each zone (e.g. Z-R61 always "Piekbelasting").
- **Built:** "Gebouwoverzicht — Riedel B.V. Ede" as the mockup's floor plan: a dark bar with the site and its total kW, the floors stacked by their level (top floor first; a floor's zones up to three a row, a last one alone the floor's width, so Expeditie & Docks spans the ground floor), each zone a block bordered in its tone with a dot that pulses faster the higher its load (a halo at peak), kW and kWh; zones without a floor outside the building, dashed. The legend Nominaal/Verhoogd/Piekbelasting/Offline. The tone is still derived: Offline without a reading for 30 minutes, Piekbelasting over its threshold, Verhoogd within 15 % of it, else Nominaal.
- **Why:** the mockup's look; real data (the tone needs a rule; model.ts `zoneTone`).

#### 186. Main meter card

_Changed, low impact._

- **Mockup:** "Live P1-meter · Hoofdaansluiting" with an animated bar, "Piekcontract 320 kW · 1.000.000 kWh/jr" and "Zonnepanelen +18,2 kW opwek" (live generation).
- **Built:** "Live P1-meter" beside the plan: the meter's name, the site's kW now with a bar of its share of the contracted peak that flows faster with the load ("N% van het piekcontract"), "Piekcontract 320 kW · 1.000.000 kWh/jr" and "Zonnepanelen +X kW opwek", estimated from the kWp and the time of day and year (no PV feed), said so under it.
- **Why:** data (no PV production feed; the total is summed from zone meters).

#### 187. Door watch card

_Changed, low impact._

- **Mockup:** "Deurbewaking — sectionaal-, koel- en vriescellen", "Live status, openstaanduur en energieverlies per deur", header badges "N deuren open", "Nu X kW verlies", "Vandaag X kWh · € Y"; each door card has an animated door graphic (panel rising, leak bars, snowflake), "+18 °C binnen / 7 °C buiten", "N min open"/"dicht", Verlies nu / Vandaag / Kosten, and "N× geopend vandaag · melding vanaf N min".
- **Built:** "Deurbewaking — sectionaal-, koel- en vriescellen" with the header's "N deuren open", "Nu X kW verlies", "Vandaag X kWh · € Y"; per door the mockup's card: icon, name, code · kind · zone, badge Open/Gesloten/Te lang open, the door's picture (the panel rising when it opens, the leak bars, faster once too long open, a snowflake on a cold store's, a truck backing up to an open dock door), "+18 °C binnen", "N min open"/"dicht" (counting up), "buiten", Verlies nu / Vandaag / Kosten, "N× geopend vandaag · melding vanaf N min", the door's unit and (with Salvo Docks on) the dock's live state. All from the sensor's real state; still with reduced motion. Door loss is real open time × loss kW (the mockup used a 0.62 fudge factor).
- **Why:** the mockup's look on real data; docks enhances energy (commit 184bcc0d).

#### 188. Dock state on dock doors

_Added, low impact._

- **Mockup:** none (D-05 is only implicitly Salvo's DOCK 05).
- **Built:** a door that is a dock's door shows the dock's state from the docks module on its card.
- **Why:** §4.2 `energy` "enhances docks".

#### 189. Consumption chart

_Changed, low impact._

- **Mockup:** "Verbruik per uur/per dag · <scope>" with bars "Gemeten" (filled as far as measured), "Nog te meten" (dashed outline for the rest of the day), "Vergelijking" (previous period), the current hour in amber, and a footer Huidig / Vergelijking / Verschil.
- **Built:** the mockup's chart: "Verbruik per uur/per dag · <selectie>", "Vandaag (tot HH:MM) versus gisteren", per bucket the comparison's bar beside this period's, filled as far as measured ("Gemeten"), the bucket being measured in amber, the rest outlined dashed ("Nog te meten") at the previous period's value scaled by how this period compares so far, and the footer Huidig / Vergelijking / Verschil. The report and the zone page keep the plain chart of completed periods.
- **Why:** the mockup's chart; what's still to measure is a projection, as real data has no future values.

#### 190. Detail panel and installations

_Changed, medium impact._

- **Mockup:** "Detail · <selectie>", "Live meetwaarden van de selectie": Actueel, Piek, Verbruik, Zones, and "Installaties" (top 5 of the selection, scaled kW), for building, floor or zone.
- **Built:** "Detail · <selectie>" beside the chart for the building, a floor or a zone: Actueel, Piek, Verbruik, Zones, and "Installaties": the selection's top five by their estimated kW now (their zone's live kW by their share of its rated power; a zone has one meter), and for a zone a link to its page, which keeps its own figures and installations.
- **Why:** the mockup's selection on the page.

#### 191. Comparison per zone

_Changed, low impact._

- **Mockup:** "Vergelijking per zone" (Zone with "floor · id", Actueel, Huidige periode, Vorige periode, Verschil, Piek, Status), rows clickable to select the zone, "N zones in selectie".
- **Built:** the same columns; rows aren't a selection; Piek is the measured peak.
- **Why:** consistency.

#### 192. Zone thresholds on their own page, managers only, saved

_Changed, medium impact._

- **Mockup:** "Energie-alerts per zone — Stel grenswaarden voor vermogen en verbruik in" on the main page: per zone a switch, "Max. vermogen (kW)", "Max. verbruik (kWh)", "Drempels: …", state badge Overschreden/Bijna bereikt/Normaal/Uitgeschakeld, "N actief". Anyone can change them; nothing is saved.
- **Built:** `/energy/<site>/thresholds` ("Grenswaarden"), the same fields per zone, saved; only owners and admins can change them ("Alleen eigenaren en beheerders wijzigen de grenswaarden."). "Max. verbruik" is per day. A new zone gets default thresholds (§2.5's formula) after its first day of readings.
- **Why:** §4.2 `energy` tables `zone_threshold`; roles (settings are `forManagers`).

#### 193. "Signalering" card

_Left out, low impact; built since branch `energy-live-demo`._

- **Mockup:** "Signalering": up to four zones "grenswaarde overschreden" / "binnen 15% van grenswaarde", or "Alle actieve zones blijven binnen de ingestelde grenswaarden."
- **Built:** "Signalering" beside the savings advice: up to four of the selection's zones over their thresholds ("grenswaarde overschreden"), doors open too long ("te lang open (N min)") and zones near them ("binnen 15% van grenswaarde"), or "Alle actieve zones blijven binnen de ingestelde grenswaarden."
- **Why:** the mockup's card.

#### 194. "Near" alerts and kWh alerts are recorded

_Added, low impact._

- **Mockup:** only breaches create a row in `energie_meldingen` (`ernst: actief`), for kW ("vermogen") or doors ("deur").
- **Built:** alerts also for "near" (≥ 85 %, badge "Bijna"), and for consumption today over the kWh threshold (metric "Verbruik"), besides power and doors. Still at most one per zone per hour and per door opening.
- **Why:** §3.4 [infer] "near was meant too", "energy (kWh)".

#### 195. Alerts become orders instead of a Focus AI batch

_Changed, high impact._

- **Mockup:** "Automatische meldingen — Vastgelegd bij elke drempeloverschrijding, inclusief aanbevolen actie": the last 8 alerts with "Gemeten X · drempel Y kW/min · tijd" and status "Open" / "In Focus AI-batch"; button "Zet N meldingen klaar voor Focus AI" bundles all open alerts into a Focus AI batch and navigates to `/focus-ai`.
- **Built:** "Open alerts" on the site page and "Alerts" (all) on `/energy/<site>/alerts`; per alert "Maak opdracht" creates an order (a repair on the door's unit, else an Offerte-opname at the customer; priority high for an active alert; description = recommendation + measurement) and links it, "Afhandelen" resolves it. Statuses Open / Opdracht gemaakt / Afgehandeld. One alert at a time, no bundling.
- **Why:** §4.1 and §6 Phase 5 ("Alerts become orders. Focus AI stays out"); §4.2 alert workflow.

#### 196. Focus AI

_Left out, medium impact._

- **Mockup:** "Zet … klaar voor Focus AI", "In Focus AI-batch", `/focus-ai?batch=…`, "Besparingsadvies Focus AI".
- **Built:** nothing of Focus AI.
- **Why:** out of scope (doc header and §6).

#### 197. Savings advice

_Changed, low impact._

- **Mockup:** "Besparingsadvies Focus AI": "Verleg piekbelasting van <scope> naar 12:00–15:00 → ~X kW lagere piek" (from live kW), "Vergelijking toont X% meer/minder verbruik", "Nachtregeling voor klimaat en verlichting → ~X kWh besparing".
- **Built:** "Besparingsadvies" with the same three lines, the peak one from the period's peak kW rather than the live kW, and "Nog geen vorige periode om mee te vergelijken" without one.
- **Why:** Focus AI out of scope; the peak shift reads more sensibly from the peak.

#### 198. Report instead of printing the page

_Changed, medium impact._

- **Mockup:** "Exporteer PDF" prints the live page with a print header "SHLTR Connect · Energy Intelligence Report · Riedel Ede", "Vandaag vs. gisteren · Hele gebouw", "Gegenereerd op …".
- **Built:** a separate "Energierapport" page with a chosen range (Van / Tot en met, 1 to 92 days) against the same number of days before: summary (Verbruik, Kosten, Alerts with "N opdracht van gemaakt, N afgehandeld"), chart, per-zone table with cost, door table; "Exporteer PDF" prints it. No "SHLTR Connect"/"Energy Intelligence Report" branding.
- **Why:** §4.2 "PDF report"; real history allows arbitrary ranges.

#### 199. Energy in the customer portal

_Added, medium impact._

- **Mockup:** no customer view.
- **Built:** portal page "Energie" ("Je energie"): per monitored site of the customer, the KPIs (without alerts), the chart, the comparison per zone and a door table (status, loss, cost today). Read-only: no alerts, thresholds or setup.
- **Why:** §1 "later perhaps their own … energy reports"; §7 phase 5b.

#### 200. Dashboard tile

_Added, low impact._

- **Mockup:** none for energy.
- **Built:** the office dashboard gets "Open energie-alerts" with "N boven een grenswaarde".
- **Why:** §4.2 `dashboard.stats`.

#### 201. Site constants are per site

_Changed, low impact._

- **Mockup:** hard-coded € 0,28/kWh and 0,375 kg CO₂/kWh.
- **Built:** tarief and CO₂-factor are site settings (defaulting to those values).
- **Why:** open question §5.17; setup page.

#### 202. Who can do what

_Changed, low impact._

- **Mockup:** one user does everything.
- **Built:** every office member sees sites, makes orders of alerts and resolves them; only owners/admins change thresholds, set up sites and manage tokens; customer contacts see their own sites read-only.
- **Why:** the app's roles (`remote-functions.ts` of the module).

### Onderdelen Shop (mockup `/parts-shop`, built: portal shop, office orders)

#### 203. The shop lives in the customer portal

_Changed, high impact._

- **Mockup:** "Onderdelen Shop" in the office sidebar, used by the signed-in SHLTR user.
- **Built:** the catalogue, cart and checkout are only in the customer portal (portal menu "Onderdelen Shop"), for a customer's contacts. The office's "Onderdelen Shop" menu item opens "Shopbestellingen" (order handling), not a shop.
- **Why:** §1 "Decided (A)"; the shop is paid with the customer's Parts Credit.

#### 204. Office order handling

_Added, high impact._

- **Mockup:** the order ends at the confirmation dialog.
- **Built:** `/parts-shop` "Shopbestellingen" (Open / Alle; Bestelling, Klant, Geplaatst, Status, Totaal) and an order page with its lines, history and steps "Bevestigen", "Verzenden", "Geleverd melden", "Bestelling annuleren". Cancelling puts the credit back in the wallet (expired credit stays expired) and the parts back in stock. Only the office can cancel.
- **Why:** §4.2 `parts-shop` ("office list with orders to confirm and ship"); §5.8 left fulfilment open.

#### 205. Order statuses

_Changed, medium impact._

- **Mockup:** on paying, "Bestelling geplaatst", "Bestelling SH-2027-018 is bevestigd", "€ … Parts Credit gereserveerd".
- **Built:** after paying the customer lands on the order's page: "Bestelling SH-…-NNN is geplaatst", "€ … Parts Credit gereserveerd"; the status is "Geplaatst" until the office confirms; then Bevestigd → Verzonden → Geleverd, or Geannuleerd. The credit is spent at once, though the copy says "gereserveerd".
- **Why:** §3.5 (the mockup knows only "bevestigd" and "gereserveerd"); parts-shop.md.

#### 206. Product management and categories

_Added, medium impact._

- **Mockup:** a fixed list of 14 products in two fixed categories.
- **Built:** "Shopartikelen" (`/parts-shop/products`): every material, put in the shop in a dialog (categorie, omschrijving, verkocht per set/stuk/paar, populair, "Te betalen met Parts Credit", "Op aanvraag", checkpoint-punten); any office member may. "Shopcategorieën" (`/parts-shop/categories`): the tenant's own categories, in the portal's order, managed by owners/admins.
- **Why:** §4.2 `parts-shop`; parts-shop.md "Tables".

#### 207. Products are materials: price and stock from the stock system

_Changed, medium impact._

- **Mockup:** price and a stock label ("Op voorraad", "Laag voorraad", "Op aanvraag") are fixed text per product.
- **Built:** a shop product is a material: its price is the material's price and the stock badge comes from the material's stock against its low-stock threshold; a product out of stock shows "Op aanvraag". An order can't exceed the stock ("Nog maar N van X op voorraad") and is limited to 1–99 per line; placing it reserves the stock (a new movement kind "reservation").
- **Why:** §4.1 "The shop's catalogue = materials plus shop fields"; §4.2.

#### 208. On-request items hide their price

_Changed, low impact._

- **Mockup:** SD-007 "Isolatiepaneel compleet" and LV-006 "Rubber zijbuffer" show "€ 320,00 / € 118,00 excl. BTW", the badge "Parts Credit geschikt" and a disabled button "Op aanvraag".
- **Built:** on-request products show "Prijs op aanvraag", no "Parts Credit geschikt" badge, and a disabled "Op aanvraag" button.
- **Why:** parts-shop.md "on request: … prijs op aanvraag" (`shop_field_on_request_description`).

#### 209. Credit eligibility is a product setting

_Changed, low impact._

- **Mockup:** "Parts Credit geschikt" appears on every product with a price.
- **Built:** a per-product flag "Te betalen met Parts Credit" ("Een van de aangewezen producten …"); a product without it shows a disabled "Niet met Parts Credit" and can't be ordered at all.
- **Why:** conditions "aangewezen producten" (§2.9, §3.5); parts-shop.md "Left out: non-credit products can't be ordered".

#### 210. Product texts and checkpoint links

_Changed, low impact._

- **Mockup:** descriptions such as SD-001 "Compleet veerpakket inclusief bevestigingsmateriaal, geschikt voor breedte 2500–4000mm"; "Checkpoint-punten" as typed texts, e.g. LV-001 "Cilinder en koppelingen op lekkage gecontroleerd", "Hef- en daalbeweging getest"; SD-007 has two points.
- **Built:** same 14 SKUs, names, prices, units and stock levels, but new short descriptions (SD-001 "Paar torsieveren op maat, met veerbreukbeveiliging.") and checkpoints linked to the actual checklist template points, so the leveller parts list the template's texts (LV-001 "Cilinders en veiligheidsventiel getest"); SD-007 has none.
- **Why:** §2.8 "the link would be by template item id, not by string".

#### 211. Rejected checkpoint suggests the part

_Added, medium impact._

- **Mockup:** the link between checkpoints and parts is only implied by the "Checkpoint-punten" list.
- **Built:** on an order's checklist the office sees "Benodigd onderdeel" for rejected points with "Toevoegen aan opdracht" (a material line on the order); in the portal a partner sees "Bestel in de shop", which opens the shop with that part already in the cart.
- **Why:** §2.8 [infer] "a failed checkpoint (Afkeur) suggests the replacement part".

#### 212. Cart and checkout layout

_Changed, medium impact._

- **Mockup:** a "Winkelwagen" button with a count in the page header opens a dialog "Afrekenen met Parts Credit — Controleer uw selectie en betaal vanuit uw SHLTR Wallet." with the lines, Beschikbaar saldo, Bestelling, Saldo na bestelling, "Verder winkelen" and "Betaal met Parts Credit"; afterwards "Sluiten".
- **Built:** no header button or dialog: a "Afrekenen met Parts Credit" card below the catalogue ("Alleen Parts Credit wordt geaccepteerd: geen gemengde betaling, geen factuur."), with lines (remove button), the same three balance rows, a VAT note and "Betaal met Parts Credit"; on phones a sticky bar "N artikelen in je winkelwagen · €…" jumps to it.
- **Why:** unknown (layout choice).

#### 213. Wallet panel in the shop

_Changed, low impact._

- **Mockup:** a header card "SHLTR Wallet · beschikbaar Parts Credit" with the amount, "Geldig t/m 31 december 2027" and a link "Bekijk programma" to Partner Bonus.
- **Built:** one line "Beschikbare Parts Credit: €…" (for partners only); no validity date and no link to the programme.
- **Why:** unknown.

#### 214. Category tabs and grouping

_Changed, low impact._

- **Mockup:** tabs with icons and counts "Alle (14)", "Sectionaaldeuren 8", "Levellers 6"; products in one grid, each card showing its category icon and name.
- **Built:** buttons "Alles" plus the tenant's categories (no counts, no icons); the catalogue is grouped under category headings with a count ("Sectionaaldeuren · 8"); cards show SKU but not the category.
- **Why:** categories are tenant data.

#### 215. Product card details

_Changed, low impact._

- **Mockup:** category icon and name, SKU, "Populair" and "Parts Credit geschikt" badges at the top, checkpoints with check icons, stock badge, unit, "€ 145,00 excl. BTW", "Toevoegen" or −/+.
- **Built:** SKU and "Populair", name, description, stock badge and "Parts Credit geschikt", plain checkpoint list, price "€ 145,00" with "excl. btw · per set", "Toevoegen" or −/+ (+ disabled at the stock/99 limit).
- **Why:** consistency with the app's components.

#### 216. Search placeholder and wording

_Changed, low impact._

- **Mockup:** "Zoek op naam of art. nr.", "Uw winkelwagen is nog leeg.", "Uw beschikbare Parts Credit is onvoldoende voor deze bestelling.", "excl. BTW".
- **Built:** "Zoek op naam of artikelnummer…", "Je winkelwagen is leeg.", "Je beschikbare Parts Credit is onvoldoende voor deze bestelling.", "excl. btw".
- **Why:** the app's Dutch style (informal "je", `docs/agents/i18n.md`).

#### 217. VAT stated explicitly

_Added, medium impact._

- **Mockup:** prices excl. BTW; VAT never mentioned at checkout.
- **Built:** "Prijzen excl. btw; over een bestelling met Parts Credit wordt geen btw berekend." on the checkout and the order; the order stores VAT zero.
- **Why:** open question §5.21 (VAT on credit-paid orders), decided provisionally for phase 4b.

#### 218. Non-partners can browse but not pay

_Added, low impact._

- **Mockup:** everyone has a wallet.
- **Built:** a contact of a customer that isn't a partner sees the catalogue but "Alleen partners betalen met Parts Credit: je bedrijf doet niet mee aan het partnerprogramma." and can't pay.
- **Why:** the shop requires the partner programme; only accepted customers take part (§2.9 conditions).

#### 219. Server-side checks at checkout

_Added, low impact._

- **Mockup:** only the disabled button when the balance would go negative.
- **Built:** the server checks it all again in one transaction and names the problem: unknown product, quantity, on request, not payable with credit, stock, balance ("De bestelling komt op €X, maar er is maar €Y Parts Credit beschikbaar.").
- **Why:** technical (§4.2 rules).

#### 220. Spending order of credit

_Added, low impact._

- **Mockup:** one wallet balance from one bonus year.
- **Built:** credit from several bonus years can coexist; a shop order spends the oldest-expiring first.
- **Why:** open question §5.7, decided in parts-shop.md "The wallet".

#### 221. Order history in the portal

_Added, medium impact._

- **Mockup:** none.
- **Built:** "Je bestellingen" (`/parts-shop/portal/orders`) and each order's page: status, "Geplaatst {datum} door {naam}", lines, "Betaald met Parts Credit".
- **Why:** needed once orders are real.

#### 222. Mixed payment, invoice payment

_Left out, medium impact._

- **Mockup:** only Parts Credit (no mixed payment, no invoice).
- **Built:** the same: no part-payment on invoice, and products not payable with credit can't be ordered.
- **Why:** parts-shop.md "Left out"; §5.7 still open.

#### 223. Dashboard stat

_Added, low impact._

- **Mockup:** the dashboard's quick link "Onderdelen Shop · 19 artikelen op voorraad".
- **Built:** the office dashboard gets "Open shopbestellingen" with "N te bevestigen"; the portal's wallet card gets "Besteed Parts Credit".
- **Why:** §4.2 `dashboard.stats`; parts-shop.md.

#### 224. Per-customer prices, fulfilment details, "Op aanvraag" handling

_Not yet, medium impact._

- **Mockup:** n/a (prices fixed).
- **Built:** one price per material for all customers; no delivery address, shipping or invoice for a shop order; nobody is notified of an on-request question ("vraag ons ernaar").
- **Why:** open question §5.8.

### Partner Bonus (mockup `/partner-bonus`, built: portal, /partner-programme)

#### 225. The page lives in the customer portal

_Changed, high impact._

- **Mockup:** "Partner Bonus" in the office sidebar, showing one account's status ("Uw samenwerking met SHLTR…").
- **Built:** the partner's page "Partner Bonus" is in the customer portal; the office has "Partnerprogramma" (all partners) and a partner card on each customer's page.
- **Why:** §1 "Decided (A)".

#### 226. Hero banner and shop button

_Left out, medium impact._

- **Mockup:** "SHLTR Group · Partnerprogramma", "Samen groeien. Meer voordeel.", "Uw samenwerking met SHLTR verdient voordeel. Volg uw Partner Omzet, Bonus Omzet en beschikbare Parts Credit in één overzicht.", button "Shop met Parts Credit"; title "Partner Bonus 2027".
- **Built:** a plain heading "Partner Bonus" with "Je level en bonus in het partnerprogramma, en je wallet."; the year is on the bonus card ("Partner Bonus 2026"). The way to the shop is "Besteed Parts Credit" in the wallet card, only when credit is available.
- **Why:** consistency with the portal's other pages.

#### 227. Tabs replaced by one long page

_Changed, low impact._

- **Mockup:** tabs "Partner Levels", "Omzet die meetelt", "Rekenvoorbeeld", "Voorwaarden".
- **Built:** stacked cards: bonus status, (choice), wallet, closed years, "Levels", "Omzet die meetelt", "De jaarcyclus", "Voorwaarden".
- **Why:** unknown.

#### 228. Programme year

_Changed, low impact._

- **Mockup:** "Partner Bonus 2027", wallet "Bonusjaar 2026", "Geldig tot en met 31 december 2027".
- **Built:** the current calendar year (2026 today) and real dates; the demo is seeded relative to today.
- **Why:** §1 notes the mockup's dates are inconsistent.

#### 229. Status card

_Changed, low impact._

- **Mockup:** "Uw voortgang" with the level chip, three figures Partner Level / Partner Omzet / Bonus Omzet, "Naar PLATINUM+ · € 200.000 van € 250.000 · 80%", progress bar, "Nog € 50.000 Partner Omzet tot PLATINUM+.", two boxes "Verwachte Cash Bonus" and highlighted "Verwacht SHLTR Parts Credit", note "Verwachting over 2027 — nog niet besteedbaar. Alleen de na de jaarafsluiting definitief toegekende Cash Bonus of SHLTR Parts Credit is besteedbaar."
- **Built:** "Partner Bonus {jaar}", "Dit jaar tot nu toe: je level en de bonus die het oplevert.", "Huidige status" + level badge, Partner Omzet and Bonus Omzet, "Naar {level}", "{omzet} van {drempel}" + %, bar, "Nog € … tot {level}" (or "Het hoogste level bereikt"), "Verwachte Cash Bonus", "Of verwacht Parts Credit", "Nog niet besteedbaar · na jaarafsluiting". No highlighted credit box.
- **Why:** unknown (shares the component with the portal home card).

#### 230. Separate Bonus Omzet for cash and credit

_Added, low impact._

- **Mockup:** one "Bonus Omzet" (the revenue table's two columns allow a difference, the data never shows one).
- **Built:** when the year's rules make them differ, the card shows "Bonus Omzet (cash)" and "Bonus Omzet (credit)".
- **Why:** §2.9 "voor de gekozen bonusvorm"; open question §5.5.

#### 231. Figures from the app's own invoices

_Changed, high impact._

- **Mockup:** static figures (€ 200.000 / € 80.000); the text says "De administratie van SHLTR is leidend".
- **Built:** computed live from invoices made in Fieldworks' invoicing module: lines of invoices paid in the year, excl. VAT, less credit notes settled in the year, each by its revenue category and its order's classification. Revenue invoiced elsewhere (SHLTR's ERP, My24Service) doesn't count unless invoiced in the app.
- **Why:** §4.2 `partner-programme`; §5.3 (compute or import) still open; §7 credit notes "by the day they're settled".

#### 232. Revenue classification per order

_Added, medium impact._

- **Mockup:** only the note "Bij offertes en opdrachtbevestigingen wordt waar mogelijk aangegeven of een project volledig, gedeeltelijk of uitsluitend voor het Partner Level meetelt."
- **Built:** in the office's order form a partner section: Omzetcategorie (default from the order type) and "Telt mee voor de bonus": Volledig / Gedeeltelijk (with "Deel dat meetelt (%)") / Alleen voor het Partner Level / Telt niet mee.
- **Why:** §2.9, §4.2, §5.4.

#### 233. Editable tiers and revenue rules per year

_Added, medium impact._

- **Mockup:** the eight tiers (BRONZE € 50.000 2,5 %/3,0 % … ELITE+ € 500.000 4,5 %/5,6 %) and the seven revenue categories are fixed.
- **Built:** the same eight tiers and seven categories are SHLTR's defaults, but managers set them per year on "Programmajaren" (`/partner-programme/years`): levels (name, threshold, cash %, credit %), per category whether it counts for the level and for cash/credit (Ja / Nee / Volgens afspraak), and "Credit geldig (jaren na het bonusjaar)". A new year starts as a copy of the previous one.
- **Why:** §3.5; conditions "SHLTR kan levels, drempels … voor een volgend kalenderjaar aanpassen".

#### 234. Levels table

_Changed, low impact._

- **Mockup:** "Van Bronze tot Elite+", "Uw Partner Omzet bepaalt uw level. Uw Bonus Omzet bepaalt uw bonus."; columns "Partner Omzet vanaf", "Partner Level", "Cash Bonus %", "Cash Bonus*", "Parts Credit %", "SHLTR Parts Credit*"; the current level's row highlighted with "Uw level"; under it "Na de definitieve jaarafsluiting kiest u voor Cash Bonus óf SHLTR Parts Credit.", "Berekening: …", and the asterisk footnote.
- **Built:** "Levels", "Je level is het hoogste waarvan je Partner Omzet de drempel haalt."; columns "Partner Omzet vanaf", "Level", "Cash Bonus", "Cash bij de drempel", "Parts Credit", "Credit bij de drempel"; no highlighted row; one note "Bij de drempel: de bonus als alles kwalificeert. Onder het eerste level ontstaat geen bonus."
- **Why:** unknown.

#### 235. "Omzet die meetelt"

_Changed, low impact._

- **Mockup:** heading "Partner Omzet bepaalt uw level. Bonus Omzet bepaalt uw bonus.", table Omzetcategorie / Partner Level / Cash Bonus / Parts Credit, and a note that written project agreements prevail.
- **Built:** "Omzet die meetelt", "Wat meetelt voor je Partner Level, en voor elke bonusvorm.", the same table from the year's rules, and the offers/order-confirmations note; "Schriftelijke projectafspraken hebben voorrang" is not repeated there.
- **Why:** unknown.

#### 236. "Rekenvoorbeeld" tab

_Left out, low impact._

- **Mockup:** "Een hoger level met projectomzet" (€ 200.000 Partner Omzet, € 120.000 projects excluded, € 80.000 × 3,8 % = € 3.040 / × 4,8 % = € 3.840) and the timeline "1 jan – 31 dec 2027 … 31 december 2028".
- **Built:** no worked example (the demo data reproduces it for Riedel). The cycle is "De jaarcyclus" in four generic steps without years ("Van 1 januari tot 31 december bouw je …"), with the validity rule as its description.
- **Why:** unknown.

#### 237. Conditions shortened and fixed

_Changed, medium impact._

- **Mockup:** "Voorwaarden": "Dit scherm vat de aangeleverde programmavoorwaarden samen…", then 15 numbered articles (Deelname en klantaccount, Bonusperiode, Netto-omzet en correcties, Level en berekening, Projecten en prijsafspraken, Keuze na vaststelling, Verwerking Cash Bonus, Toekenning Parts Credit, Besteedbaarheid van de bonus, Besteding Parts Credit, Geldigheid, Indicatieve informatie, Retouren na toekenning, Uitsluitingen, Wijzigingen) and "De administratie van SHLTR is leidend…".
- **Built:** nine short conditions (Deelname, Omzet die meetelt, Level en bonus, Projecten, Je keuze, Cash Bonus, Parts Credit, Geldigheid, Wijzigingen) and "Onze administratie is leidend, behoudens aantoonbare administratieve fouten." Bonusperiode, Indicatieve informatie, Retouren na toekenning and Uitsluitingen are missing; Toekenning, Besteedbaarheid and Besteding are merged. Written as "wij/ons", not "SHLTR". The text is fixed app copy, not something SHLTR edits.
- **Why:** unknown (summarised as messages, parts-shop.md "the conditions, as messages").

#### 238. Wallet card

_Changed, low impact._

- **Mockup:** "Bonusjaar 2026 · SHLTR Wallet": Toegekend, Al besteed, Nu beschikbaar, "Geldig tot en met 31 december 2027", button "Bekijk geschikte onderdelen".
- **Built:** "SHLTR Wallet", "Je Parts Credit om te besteden.", Toegekend, Al besteed, Nu beschikbaar, Geldig tot; a list of entries (Toegekend, Besteed, Teruggeboekt, Vervallen, Correctie, with date and note, e.g. "Bestelling SH-…"), "Toegekend saldo staat los van je verwachte bonus over dit jaar.", and "Besteed Parts Credit" (with the shop on and credit available). It spans all bonus years rather than one.
- **Why:** §3.5 wallet ledger; parts-shop.md "The wallet".

#### 239. The customer chooses cash or credit in the portal

_Added, high impact._

- **Mockup:** only the text "Na definitieve vaststelling kiest u Cash Bonus óf SHLTR Parts Credit".
- **Built:** a closed year with a bonus and no choice shows "Kies je bonus over {jaar}" with both amounts; choosing asks for confirmation ("Je kiest één keer: dit is onherroepelijk.") and can't be done twice. Managers can record the choice in the office too. There is no deadline and no default when nobody chooses.
- **Why:** §5.6; parts-shop.md "The choice".

#### 240. Closed years

_Added, medium impact._

- **Mockup:** none.
- **Built:** "Afgesloten jaren": per year its level, Partner Omzet, Bonus Omzet, and "Gekozen: … €…", "Wacht op je keuze" or "Geen bonus over dit jaar"; for cash, "Uitbetaald met creditnota CN-…" / "Wordt uitbetaald met creditnota …".
- **Why:** needed once years close.

#### 241. Year close in the office

_Added, medium impact._

- **Mockup:** "Na de jaarafsluiting stelt SHLTR … vast" (text only).
- **Built:** managers close a year after 31 December for all partners ("{jaar} afsluiten", a preview with totals, "Dit is onherroepelijk") or per partner, freezing figures, level and both bonus amounts.
- **Why:** §4.2, §5.6.

#### 242. Cash bonus paid with a credit note

_Added, medium impact._

- **Mockup:** "SHLTR verwerkt de Cash Bonus bijvoorbeeld via een creditnota of verrekening" (text only).
- **Built:** for a partner who chose cash, a manager makes a standalone credit note "Partner Bonus {jaar}" (line "Cash Bonus {jaar}") from the partner card; invoicing gained credit notes (CN-…, draft → sent → settled, own PDF "Creditnota"). Paying outside the app remains possible. Offsetting against future invoices is not automated.
- **Why:** §7 credit notes (commit 7ff540cc).

#### 243. Accepting partners

_Added, medium impact._

- **Mockup:** "Deelname is beschikbaar voor door SHLTR geaccepteerde klanten" (text only).
- **Built:** managers accept a customer as partner on its page ("Accepteren als partner"; "Partner sinds …, geaccepteerd door …"). A contact of a non-partner sees "Geen partner — Je bedrijf doet niet mee aan het partnerprogramma. Vraag ons ernaar."
- **Why:** §3.5 partner account; §5.2 open.

#### 244. Office partner list, customer card, dashboard card

_Added, medium impact._

- **Mockup:** none (the mockup's dashboard card shows one account's status).
- **Built:** "Partnerprogramma" list (partner, level, progress, wallet, partner since; search, level filter); a "Partner Bonus {jaar}" card on each customer's page with figures, close and choice actions, wallet and manual entries; the office dashboard card "Partnerprogramma {jaar}" with partners per level and "Te besteden credit". The per-account card like the mockup's is on the portal home instead.
- **Why:** §4.2; §6 phase 3.

#### 245. Manual wallet entries

_Added, low impact._

- **Mockup:** none.
- **Built:** managers add a booking by hand: "Besteed aan onderdelen" (outside the shop) or "Credit toegevoegd", with a note and validity date.
- **Why:** §3.5 `adjustment`.

#### 246. Credit expiry

_Added, low impact._

- **Mockup:** "Niet besteed tegoed vervalt automatisch" (text only).
- **Built:** a daily job books unspent credit past its date as "Vervallen".
- **Why:** §4.2 "Daily job: expiry entries".

#### 247. Returns after award, exclusions, overdue suspension

_Not yet, low impact._

- **Mockup:** conditions "Retouren na toekenning" (offset the bonus difference), "Uitsluitingen" (products, groups, projects, actions), Cash Bonus suspended or offset on overdue payments.
- **Built:** none of these is enforced; after a year closes its figures stay frozen; exclusions exist only as revenue categories, order classification and the shop's credit-eligible flag.
- **Why:** unknown (not in §4.2's logic).

#### 248. Who sees and does what

_Changed, low impact._

- **Mockup:** one user.
- **Built:** every office member sees figures and classifies orders; only owners/admins set rules, accept partners, close years, record choices, add wallet entries and make credit notes; a partner's contacts see their own bonus and wallet and make the choice.
- **Why:** the app's roles.
