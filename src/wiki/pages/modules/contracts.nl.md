---
title: Servicecontracten
summary: Servicecontracten die de apparaten van een klant dekken met een gegarandeerde reactietijd, gedekt werk gratis maken en een maandbedrag factureren.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een servicecontract is een onderhoudsafspraak: een klant betaalt een vast bedrag per maand, en in
ruil daarvoor worden de apparaten van de klant gedekt met een gegarandeerde reactietijd. De module
heet **Servicecontracten** (in de code `contracts`), met een eigen lijst op `/contracts`.

## Wat de module toevoegt

- **Contracten.** Elk contract heeft een nummer, een klant, een **niveau** (Basis, Standaard of
  Premium), een begin- en einddatum, een maandbedrag, een reactietijd in uren en de apparaten van de
  klant die het dekt. Een contract is Toekomstig, Actief of Verlopen, afhankelijk van zijn begin- en
  einddatum. De pagina van het contract toont de gedekte apparaten en het gedekte werk dat er in de
  looptijd van het contract aan is gedaan.
- **Gratis werk.** Een opdracht is gedekt als de apparaten ervan gedekt waren door een contract dat
  actief was op de dag dat de opdracht werd gemaakt. Wat erbij inbegrepen is, hangt af van het
  niveau:
  - Basis: niets, alleen de gegarandeerde reactietijd.
  - Standaard: arbeid.
  - Premium: arbeid en materialen.

  Het inbegrepen bedrag staat op de opdracht als kortingsregel met de naam van het contract, dus de
  prijs die de klant betaalt, daalt met precies dat bedrag. Het dekt het onderhoud en de service
  van de apparaten (storingen, reparaties, onderhoud, keuringen), geen nieuw werk eraan, schade of
  ander werk.

- **Reactietijden.** Op een gedekte storing of reparatie (een call-out) moet binnen de reactietijd
  van het contract gereageerd worden, gerekend vanaf het moment dat de opdracht werd gemaakt. Er is
  gereageerd zodra hij is ingepland. Tot dan ligt hij op schema, is hij **SLA in gevaar** zodra er
  minder dan een kwart van de tijd over is, en te laat na de deadline. De opdracht draagt het label,
  in lijsten en op zijn pagina.
- **Maandbedragen op facturen.** Heeft de tenant facturatie, dan wordt elke maand van de contracten
  van een klant aangeboden als post om te factureren, zodat het maandbedrag samen met de afgeronde
  opdrachten van de klant wordt gefactureerd.

### Waar je het ziet

- Het dashboard heeft twee kaarten: de gedekte storingen waarvan de reactietijd in gevaar is, de
  dringendste eerst, en de contracten die binnenkort aflopen en niet verlengd zijn.
- De pagina van een opdracht en die van een apparaat krijgen elk een kaart die zegt of een contract
  het dekt, en welk.

### Werkt samen met

- **Facturatie** (verrijkt): contracten bieden hun maandbedragen aan Facturatie aan. Zonder
  Facturatie dekken ze nog steeds werk en bewaken ze reactietijden. Zie
  [Facturatie](/wiki/modules/invoices).
- **Materialen** (verrijkt): alleen voor de seed (de demogegevens), zodat de storingen in de demo
  materiaalregels krijgen.
- **Onderhoudsplannen** zet de plannen van de gedekte apparaten van een contract op de pagina
  ervan. Zie [Onderhoudsplannen](/wiki/modules/maintenance).

Servicecontracten heeft niets nodig.

<TryIt as="planner" />

<HowItWorks />

Een contract wijzigt nooit een opdracht. Zijn `server/index.ts` levert vier bijdragen: de
toegangsregel voor zijn gegevens (`accessRules`), en drie aan extension points van de kern (plekken
waar de kern ruimte laat voor modules):

- `orders.adjustPrices` geeft per gedekte opdracht een negatieve correctie terug. Alles wat het
  totaal van een opdracht toont of optelt, prijst hem met `priceOrders()`, dus de korting is
  dezelfde in de opdracht, de lijst, de factuur en het dashboard.
- `orders.tag` geeft het SLA-label terug van een opdracht waarvan de reactie in gevaar of te laat
  is.
- `invoices.billableItems` geeft een regel per maand van de contracten van de klant in de periode
  van de factuur (het doet alleen mee als facturatie aan staat).

De regels staan op één plek, `coverage.ts`: welke opdrachten een contract dekt, wat een niveau
inbegrijpt (`coveredAmount()`) en hoe de stand van een deadline volgt uit de reactietijd
(`responseDeadline()`). De server past ze toe en de pagina's tonen ze, dus ze kunnen elkaar niet
tegenspreken. Een opdracht over meerdere apparaten is alleen gedekt door een contract dat ze
allemaal dekt, omdat je de prijs en reactietijd van een opdracht niet over contracten kunt
verdelen. De pagina van het contract is een `RecordPage` met eigen slots (plekken die andere
modules vullen, `contracts.detail.side`), gedeclareerd met `defineRecordPoints("contracts", ...)`.
Zo zet Onderhoudsplannen er zijn plannen neer zonder de tabellen van Servicecontracten aan te
raken.

- <SourceLink path="src/modules/contracts/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/contracts">de map van de module</SourceLink>.
- <SourceLink path="src/modules/contracts/coverage.ts">coverage.ts</SourceLink>: dekking, prijs en
  reactietijd, op één plek.
- <SourceLink path="src/modules/contracts/server/index.ts" line={44} symbol="defineServerModule">server/index.ts</SourceLink>:
  de vier bijdragen.
- <SourceLink path="src/modules/contracts/api/extensions.ts">api/extensions.ts</SourceLink>: de
  eigen slots van de contractpagina.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
