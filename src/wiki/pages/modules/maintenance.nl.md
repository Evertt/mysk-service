---
title: Onderhoud
summary: Onderhoud elk apparaat op een vast interval, en maak van de bezoeken die eraan komen opdrachten, met de hand of elke dag vanzelf.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Onderhoudsplannen zijn het antwoord op "wanneer moet dit apparaat weer een beurt?". In de app heet
de module **Onderhoudsplannen**; het menu-item staat in de zijbalk na Apparatuur. Een plan zegt dat
een apparaat om de zoveel maanden een bezoek krijgt, en de module maakt van elk bezoek dat eraan
komt een opdracht.

## Wat de module toevoegt

- **Plannen.** Een plan hoort bij een apparaat, en heeft een omschrijving, een **interval in
  maanden**, de dag waarop het volgende bezoek gepland staat, een soort opdracht (**onderhoud** of
  **inspectie**) en een schakelaar Gepauzeerd. Je voegt ze toe op de pagina van het apparaat, in
  een kaart Onderhoud, of op de pagina van een contract.
- **De lijst met geplande bezoeken** op `/maintenance`: de bezoeken die eraan komen, te filteren op
  Te laat, "Te laat en de komende 30 dagen" of "Te laat en de komende 90 dagen". Selecteer plannen
  en kies **Opdrachten maken**: elk plan krijgt een opdracht voor zijn apparaat, en het volgende
  bezoek schuift één interval op.
- **Vanzelf opdrachten.** Een manager kan in de instellingen van de module automatische opdrachten
  aanzetten. Elke dag krijgen plannen die eraan komen hun opdrachten, net als met Opdrachten maken.
  Een plan krijgt geen nieuwe opdracht zolang zijn laatste nog open staat. **Dagen vooruit** bepaalt
  hoe vroeg een plan meetelt (plannen die te laat zijn tellen altijd mee), en **Klanten mailen**
  stuurt de klant een bericht als er een opdracht voor zijn apparaat wordt gemaakt.
- **Ritme.** Het volgende bezoek schuift op vanaf de vorige geplande datum, niet vanaf vandaag, en
  houdt zijn dag van de maand, dus een bezoek dat te laat is, verschuift het schema niet.

### Waar je het ziet

- De apparatenlijst krijgt een kolom **Volgend onderhoud**: de vroegste geplande datum van de
  actieve plannen van het apparaat, te sorteren, en te filteren op te laat, gepland binnen 30 dagen
  of geen plan.
- Het dashboard heeft een kaart met de bezoeken die eraan komen en het aantal dat te laat is.
- De pagina van een contract toont de plannen van de gedekte apparaten, en kan elk gedekt apparaat
  zonder plan dit plan geven, voor het eerst gepland één interval na vandaag.

### Werkt samen met

- **Contracten** (verrijkt): de plannen van de gedekte apparaten van een contract op de pagina
  ervan. Zie [Contracten](/wiki/modules/contracts).
- **Conditie** (verrijkt): het volgende bezoek van een apparaat staat als kolom "Volgende" in de
  lijst van Onderdelenbeheer. Zie [Conditie](/wiki/modules/condition).

Onderhoud heeft niets nodig, en werkt zonder beide.

<TryIt as="planner" />

<HowItWorks />

Onderhoud is de module om te lezen voor een **eigen lijst met een bulkactie**: de lijst met
geplande bezoeken (`list/due-list.ts`, `server/list-sql.ts`) is een lijst die op de server wordt
opgebouwd, en Opdrachten maken is de bulkactie ervan. Het is ook het voorbeeld van een **kolom in
een lijst van de kern** (`columns/equipment.list.columns.ts`, met de SQL in `server/columns/`,
bijgedragen aan het punt `equipment.list.columns` van de apparatenlijst), van **bijdragen aan de
slot van een andere module** (een plek in een pagina die een module vult:
`slots/contracts.detail.side/`, die alleen `api/extensions.ts` van contracten mag importeren en de
gedekte apparaten als props krijgt), en van gegevens maken via een service van de kern.

Beide manieren om van een plan een opdracht te maken lopen via `orderPlan()` in
`server/orders.ts`, dat `createOrders()` van de kern aanroept, zodat de opdracht van een plan
precies zo wordt genummerd, gecontroleerd en gelogd als elke andere. De dagelijkse taak,
`runDueMaintenance`, bijgedragen aan `jobs.daily`, gebruikt de gedeelde `dailyOrderRun()`: die
draait als het systeem in elke tenant die het wil, maakt de opdracht van elk plan in een eigen
transactie, telt wat mislukt, en stuurt de herinneringsmails achteraf, buiten de transacties. Je
kunt hem veilig herhalen. De module declareert `orderTypes: ["maintenance", "inspection"]`, die een
tenant niet kan verbergen zolang hij aan staat, en met conditie aan levert hij `condition.signals`
(het volgende bezoek, dat de lijst van Onderdelenbeheer toont).

- <SourceLink path="src/modules/maintenance/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/maintenance">de map van de module</SourceLink>.
- <SourceLink path="src/modules/maintenance/server/orders.ts" line={40}>orderPlan()</SourceLink>: een
  plan dat eraan komt, wordt een opdracht.
- <SourceLink path="src/modules/maintenance/server/automatic.ts">automatic.ts</SourceLink>: de
  dagelijkse taak.
- <SourceLink path="src/modules/maintenance/columns/equipment.list.columns.ts">equipment.list.columns.ts</SourceLink>:
  de kolom.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
