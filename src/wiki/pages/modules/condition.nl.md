---
title: Onderdelenbeheer
summary: De conditie van elk apparaat en zijn onderdelen door de tijd, berekend uit de checklists, met een status die zegt wat aandacht nodig heeft.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Onderdelenbeheer (in de code de module `condition`) houdt bij hoe het met elk apparaat van je
klanten gaat, en met de **onderdelen** erin (bijvoorbeeld een veerpakket in een deur). Het
menu-item staat in de zijbalk na Apparatuur. De module beantwoordt één vraag: welke apparaten
hebben aandacht nodig, en hoe snel?

## Wat de module toevoegt

- **Een conditiescore.** Als een monteur een checklist afrondt, krijgt het apparaat een score van 0
  tot 100: het deel van de punten dat Goed is bevonden. Punten op N.v.t. tellen niet mee. De
  onderdelen die de punten van de checklist controleren, krijgen op dezelfde manier een eigen
  score. De monteur kan daarna advies over het apparaat toevoegen. Elke score is een nieuw record,
  dus het apparaat bouwt een historie op, en de laatste is zijn conditie.
- **Een status.** Elk apparaat is **Kritiek**, **Aandacht**, **Gepland** of **In orde**:
  - Kritiek: de conditie ligt onder de kritieke drempel, of de keuring is verlopen. Plan het binnen
    5 werkdagen in.
  - Aandacht: de conditie ligt onder de aandachtsdrempel, een punt van de keuring is afgekeurd, of
    er staat advies open. Neem het mee bij het volgende bezoek.
  - Gepland: er is werk aan ingepland.
  - In orde: binnen het interval en de keuring is geldig.

  Een apparaat krijgt de status van zijn slechtste onderdeel.

- **De pagina Onderdelenbeheer.** Een lijst van apparaten met hun scorebalk en status, een legenda
  die de statussen uitlegt, het activiteitenlog van de apparaten, en uitleg over de vier stappen:
  koppelen, monitoren, plannen, uitvoeren en vastleggen. Kantoor kan als correctie met de hand een
  conditie vastleggen, die geldt tot er een nieuwere is, zoals die van de volgende afgeronde
  checklist.
- **Onderdelen.** Op de pagina van een apparaat voegt kantoor onderdelen toe: een naam, het
  **artikel** in de shop dat het is (een materiaal), en de checklistpunten die het
  controleren. Een afgekeurd punt van een onderdeel stelt eerst het artikel ervan voor.
- **Instellingen.** Een manager stelt de twee drempels in (kritiek onder, aandacht onder) en of
  kritieke apparaten **automatisch worden ingepland**. Staat dat aan, dan krijgt elk kritiek
  apparaat zonder open opdracht elke dag een onderhoudsopdracht: een nieuwe opdracht met prioriteit
  Hoog, die kantoor nog moet inplannen en die binnen 5 werkdagen moet gebeuren.

### Waar je het ziet

- De apparatenlijst krijgt twee kolommen, de laatste conditie en de status, allebei te sorteren en
  te filteren.
- De pagina van een apparaat toont zijn conditie en zijn onderdelen. De pagina van een klant toont
  de servicegeschiedenis van zijn apparaten: de afgeronde opdrachten en checklists en de
  vastgelegde condities.
- Het dashboard heeft een tegel voor de apparaten die kritiek zijn of aandacht nodig hebben.
- Het monteursportaal vraagt om advies zodra een checklist is afgerond.
- In het klantportaal toont de startpagina de apparaten van de klant die aandacht nodig hebben.

### Werkt samen met

- **Werkbonnen** (verrijkt, en wordt erdoor verrijkt): zonder Werkbonnen zijn er geen scores uit
  keuringen, dus is de conditie alleen wat kantoor vastlegt. Zie
  [Werkbonnen](/wiki/modules/checklists).
- **Onderhoudsplannen** zet het volgende bezoek van een apparaat in de lijst, als kolom
  "Volgende", zie [Onderhoudsplannen](/wiki/modules/maintenance).
- **Materialen** zijn de artikelen van de onderdelen, zie [Materialen](/wiki/modules/materials).
- **Onderdelen Shop** zegt welke punten een artikel oplost, zie
  [Onderdelen Shop](/wiki/modules/parts-shop).

Onderdelenbeheer heeft geen module nodig.

<TryIt as="planner" />

<HowItWorks />

Onderdelenbeheer declareert de hooks waarop de modules eromheen antwoorden. Daarmee is deze
module het duidelijkste voorbeeld van een module waar andere modules op inhaken. In
`api/extensions.ts` declareert de module:

- `condition.signals`: SQL die andere modules bijdragen aan de rij van een apparaat. Werkbonnen
  geeft de keuringsstatus, die de status van het apparaat meeneemt; Onderhoudsplannen geeft het
  volgende bezoek, dat de lijst toont.
- `condition.articles`: de artikelen van onderdelen (materialen).
- `condition.checkpoints` en `condition.articleCheckpoints`: de punten die een onderdeel
  controleren (Werkbonnen geeft de sjabloonpunten van een apparaat, Onderdelen Shop de punten die
  een artikel oplost).
- `condition.list.columns`: kolommen in zijn eigen apparatenlijst, die Werkbonnen aanvult met de
  keuringskolom.

Elk daarvan is een **immediate collector** (`collectNow()`, een verzamelpunt dat meteen antwoord
krijgt): de bijdragers antwoorden direct, zonder te wachten, omdat het antwoord deel wordt van de
SQL van een lijst. Om dezelfde reden wordt de status in SQL berekend (`server/status-sql.ts`) met
gecorreleerde subqueries, en staan dezelfde regels in code (`rolledUpStatus()` in `model.ts`) voor
losse records. Een statement bindt hoogstens 100 waarden, dus die SQL is geschreven met letterlijke
constanten, niet met parameters.

In de andere richting haakt Onderdelenbeheer in op de modules die het verrijkt, in
`server/index.ts`. Met Werkbonnen aan legt `checklists.completed` de condities van het apparaat en
de onderdelen vast op het moment dat een checklist wordt afgerond. De dagelijkse taak (`jobs.daily`)
plant kritieke apparaten in voor tenants die dat willen, als het systeem via `createOrders()` van de
kern, zodat de opdracht een nummer krijgt en gelogd wordt zoals elke andere. Onderdelen bewaren hun
artikel en punten als gewone ids, zonder foreign key, omdat de modules waarnaar ze verwijzen
optioneel zijn. De servicegeschiedenis is een weergave van het activiteitenlog
(`server/history.ts`), geen tabel.

- <SourceLink path="src/modules/condition/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/condition">de map van de module</SourceLink>.
- <SourceLink path="src/modules/condition/model.ts" line={114}>rolledUpStatus()</SourceLink>: de
  status van een apparaat, met die van zijn onderdelen.
- <SourceLink path="src/modules/condition/server/status-sql.ts">status-sql.ts</SourceLink>: dezelfde
  regels in SQL.
- <SourceLink path="src/modules/condition/server/automatic.ts" line={122}>planCriticalUnits()</SourceLink>:
  de dagelijkse taak.
- <SourceLink path="src/modules/condition/api/extensions.ts">api/extensions.ts</SourceLink>: de
  punten waaraan anderen bijdragen.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
