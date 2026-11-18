---
title: Onderdelenbeheer
summary: De conditie van elk apparaat en zijn onderdelen door de tijd, op de NEN 2767-schaal uit de gebreken die de checklists vinden, met een status die zegt wat aandacht nodig heeft.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Onderdelenbeheer (in de code de module condition) houdt bij hoe het met elk apparaat van je
klanten gaat, en met de **onderdelen** erin (bijvoorbeeld een veerpakket in een deur). Het
menu-item staat in de zijbalk na Apparatuur. De module beantwoordt één vraag: welke apparaten
hebben aandacht nodig, en hoe snel?

## Wat de module toevoegt

- **Een conditie op de NEN 2767-schaal.** Een conditie krijgt een score van 1 tot 6: 1 Uitstekend
  (nieuwbouwkwaliteit, geen gebreken), 2 Goed, 3 Redelijk, 4 Matig, 5 Slecht en 6 Zeer slecht
  (technisch rijp voor vervanging). Ze bestaat uit **gebreken**: wat er mis is, het element waarop
  het zit (het apparaat zelf of een van zijn onderdelen), de **ernst** (gering, serieus, ernstig),
  de **omvang** (het percentage van het element; de klassen van NEN zijn minder dan 2%, 2–10%,
  10–30%, 30–70% en 70% of meer, en de chip van elke klasse zet een gangbare waarde) en de
  **intensiteit** (begin-, gevorderd of eindstadium), met foto's als je wilt. De gebreken van een
  element krijgen hun score volgens **de methode van NEN 2767-1**: ernst en intensiteit geven elk
  gebrek een categorie (1 tot 5), de omvang van gebreken in één categorie telt op, elke categorie
  krijgt punten naar de klasse van dat totaal, en alle punten samen geven de score. Zo kunnen
  meerdere kleine gebreken slechter scoren dan elk apart, en scoort één gebrek zoals de tabellen
  van de norm het zeggen. Een conditie zonder gebreken is 1. De score van een conditie is die van
  het slechtste element, en de score van een apparaat de slechtste van zijn eigen laatste conditie
  en die van zijn onderdelen.
- **Uit de checklists.** Als een monteur in het monteursportaal een punt afkeurt, vraagt het portaal
  om het gebrek: ernst, omvang, intensiteit en foto's, met de score die daaruit volgt zichtbaar
  terwijl hij kiest. Bij het afronden van de checklist zijn de afgekeurde punten de gebreken van de
  nieuwe conditie van het apparaat, en krijgt elk onderdeel er een uit zijn eigen punten. Goede en
  N.v.t.-punten voegen geen gebreken toe, dus een checklist zonder afkeuringen legt 1 vast. De
  monteur kan daarna advies over het apparaat toevoegen. Elke conditie is een nieuw record, dus het
  apparaat bouwt een historie op, en de laatste is zijn conditie.
- **Een status.** Elk apparaat is **Kritiek**, **Aandacht**, **Gepland** of **In orde**:
  - Kritiek: de conditie is de kritieke drempel of slechter, of de keuring is verlopen. Plan het
    binnen 5 werkdagen in.
  - Aandacht: de conditie is de aandachtsdrempel, een punt van de keuring is afgekeurd, of er staat
    advies open. Neem het mee bij het volgende bezoek.
  - Gepland: er is werk aan ingepland.
  - In orde: binnen het interval en de keuring is geldig.

  Een apparaat krijgt de status van zijn slechtste onderdeel.

- **De pagina Onderdelenbeheer.** Een lijst van apparaten met hun score en status, een legenda
  die de statussen en de NEN 2767-schaal uitlegt, het activiteitenlog van de apparaten, en uitleg over de vier stappen:
  koppelen, monitoren, plannen, uitvoeren en vastleggen. Het kantoor kan als correctie met de hand een
  conditie vastleggen, met gebreken en foto's en de score direct zichtbaar, die geldt tot er een
  nieuwere is, zoals die van de volgende afgeronde checklist. Condities die vóór NEN 2767 als
  percentage zijn vastgelegd, zijn per band omgezet (90% of meer is 1, 80–89% 2, 70–79% 3, 40–69%
  4, 20–39% 5, onder 20% 6), en de historie zegt van welk percentage.
- **Onderdelen.** Op de pagina van een apparaat voegt het kantoor onderdelen toe: een naam, het
  **artikel** in de shop dat het is (een materiaal), en de checklistpunten die het
  controleren. Een afgekeurd punt van een onderdeel stelt eerst het artikel ervan voor.
- **Instellingen.** Een manager stelt de twee drempels in (kritiek vanaf, standaard 5, en aandacht
  vanaf, standaard 4, allebei tussen 2 en 6) en of
  kritieke apparaten **automatisch worden ingepland**. Staat dat aan, dan krijgt elk kritiek
  apparaat zonder open opdracht elke dag een onderhoudsopdracht: een nieuwe opdracht met prioriteit
  Hoog, die het kantoor nog moet inplannen en die binnen 5 werkdagen moet gebeuren.

### Waar je het ziet

- De apparatenlijst krijgt twee kolommen, de conditiescore en de status, allebei te sorteren en
  te filteren.
- De pagina van een apparaat toont zijn conditie en zijn onderdelen. De pagina van een klant toont
  de servicegeschiedenis van zijn apparaten: de afgeronde opdrachten en checklists en de
  vastgelegde condities.
- Het dashboard heeft een tegel voor de apparaten die kritiek zijn of aandacht nodig hebben.
- Het monteursportaal vraagt om het gebrek van een afgekeurd punt, en om advies zodra een checklist
  is afgerond.
- In het klantportaal toont de startpagina de apparaten van de klant die aandacht nodig hebben, en
  toont de pagina van een apparaat zijn score ("3 · Redelijk") en status als badge (niet zijn
  gebreken of advies).

### Werkt samen met

- **Werkbonnen** (verrijkt, en wordt erdoor verrijkt): zonder Werkbonnen zijn er geen scores uit
  keuringen, dus is de conditie alleen wat het kantoor vastlegt. Zie
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

De methode van NEN 2767 staat in één bestand, `nen2767.ts`, met een spec die elke cel van de
tabellen voor één gebrek ermee vergelijkt, en het voorbeeld uit de norm zelf (een kozijn met 32,6
punten, dus 5). De score van een conditie, en die van elk gebrek apart, wordt op de server
berekend en bij het record bewaard, zodat de SQL van de lijsten alleen de slechtste van de laatste
neemt. Foto's van gebreken
staan in de fotoopslag en worden geserveerd op `/condition/photos/<id>` aan wie de condities van het
apparaat mag lezen (`conditionPhoto` in het toegangsregister).

In de andere richting haakt Onderdelenbeheer in op de modules die het verrijkt, in
`server/index.ts`. Met Werkbonnen aan vraagt het slot `checklists.field.rejected` om het gebrek van
een afgekeurd punt, en legt `checklists.completed` de condities van het apparaat en de onderdelen
vast, met die gebreken, op het moment dat een checklist wordt afgerond. De dagelijkse taak (`jobs.daily`)
plant kritieke apparaten in voor tenants die dat willen, als het systeem via `createOrders()` van de
kern, zodat de opdracht een nummer krijgt en gelogd wordt zoals elke andere. Onderdelen bewaren hun
artikel en punten als gewone id's, zonder foreign key, omdat de modules waarnaar ze verwijzen
optioneel zijn. De servicegeschiedenis is een weergave van het activiteitenlog
(`server/history.ts`), geen tabel.

- <SourceLink path="src/modules/condition/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/condition">de map van de module</SourceLink>.
- <SourceLink path="src/modules/condition/nen2767.ts" line={128}>elementScoreOf()</SourceLink>: de
  score van een element uit zijn gebreken, volgens de methode van NEN 2767-1.
- <SourceLink path="src/modules/condition/model.ts" line={191}>rolledUpStatus()</SourceLink>: de
  status van een apparaat, met die van zijn onderdelen.
- <SourceLink path="src/modules/condition/server/conditions.ts" line={298}>recordChecklistConditions()</SourceLink>:
  de condities en gebreken van een afgeronde checklist.
- <SourceLink path="src/modules/condition/server/status-sql.ts">status-sql.ts</SourceLink>: dezelfde
  regels in SQL.
- <SourceLink path="src/modules/condition/server/automatic.ts" line={123}>planCriticalUnits()</SourceLink>:
  de dagelijkse taak.
- <SourceLink path="src/modules/condition/api/extensions.ts">api/extensions.ts</SourceLink>: de
  punten waaraan anderen bijdragen.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
