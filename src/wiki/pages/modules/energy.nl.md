---
title: Energie
summary: Vermogen en verbruik per zone van het gebouw van een klant, deuren die energie laten weglekken, grenswaarden en alerts die opdrachten worden.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

De module Energie toont het gebouw van een klant live: hoeveel vermogen en energie elk deel ervan
gebruikt, welke deuren open staan en wat dat kost, en wanneer iets over zijn grens gaat. Van een
alert maak je met één klik een opdracht, en zo wordt monitoring werk voor een monteur.

## Wat de module toevoegt

- **Locaties.** Een locatie is een vestiging van een van je klanten met een meter. De
  instelpagina ervan bevat het contract van de hoofdaansluiting, de zonnepanelen, de prijs en de
  uitstoot van een kWh, en de **zones** van de locatie (delen met een eigen meter), de
  **installaties** in elke zone met hun opgesteld vermogen, en de **deuren** waarvan de opentijd
  energie kost.
- **Het live overzicht.** Per locatie: de live P1-meter tegenover het piekcontract, het verbruik per
  uur of per dag, een vergelijking per zone, de stand van elke zone (Nominaal, Verhoogd,
  Piekbelasting of Offline), de deurbewaking met het energieverlies per deur, en besparingsadvies.
  De pagina van een zone toont de installaties en hun geschatte deel van het verbruik van vandaag.
- **Grenswaarden.** Per zone een maximaal vermogen en een maximaal verbruik per dag. Gaat een zone
  eroverheen, dan komt er een alert; bij 85% een alert "bijna". Een nieuwe zone krijgt
  standaardgrenswaarden na de eerste dag met metingen.
- **Alerts.** Zones boven of bijna aan hun grenswaarden, en deuren die te lang open staan. Elke
  alert staat Open, kan een opdracht worden, of worden afgehandeld. De opdracht is een
  **reparatie** van het apparaat van de deur als de alert over een deur gaat, en anders een
  **offerte opname** bij de klant van de locatie.
- **Een rapport** per locatie, om af te drukken of aan de klant te geven.
- **Het eigen overzicht van de klant.** Klanten zien het vermogen en verbruik van hun locaties,
  tegenover de vorige periode, en wat de deuren laten weglekken, alleen lezen, op een pagina in het
  klantportaal.

### Waar je het ziet

- Het dashboard heeft een tegel voor de open energie-alerts.
- De pagina van een klant heeft een kaart met de locaties die worden gemeten. Een gemeten locatie
  kan niet worden verwijderd.
- De bel van kantoor gaat bij de alerts die de metingen opleveren.

### Werkt samen met

Energie heeft niets nodig en verrijkt niets. **Docks** verrijkt Energie: een deur die ook de deur
van een dock is, toont de status van het dock op de deurkaart van Energie. Zie
[Docks](/wiki/modules/docks).

<TryIt as="planner" />

<HowItWorks />

Energie wordt van buiten gevoed, net als docks. Een gateway op de locatie post **totalen per zone
per 15 minuten** en deur-events naar `POST /energy/ingest`, met een token dat een manager op de
instellingenpagina van de module heeft gemaakt; `GET /energy/ingest` geeft de locaties van het
token terug met hun zone- en deurcodes, om een gateway in te stellen. Eén batch is één korte
transactie, want op Cloudflare is de database een Durable Object, waarvan de transacties elk ander
request ophouden. Na de metingen controleert `evaluate.ts` de zones die metingen kregen tegen hun
grenswaarden, interval voor interval, en elke deur op de keren dat hij openging. Een overschrijding
wordt één keer per sleutel een alert: het vermogen van een zone per lokaal uur, het verbruik per
lokale dag, een deur per keer dat hij opengaat. Een deuralert die nog open staat, volgt die opening
zolang die duurt. Alleen de overschrijdingen van de laatste dag leveren alerts op, dus een gateway
die vorige week inhaalt, levert er geen op, terwijl een deur die sinds vorige week open staat dat
wel doet.

Elke batch kondigt zijn metingen aan als `energy_reading`, een **live type** in het manifest: het
wordt nooit gelogd, maar houdt de open pagina's live. Het manifest noemt ook de soorten opdrachten
die een alert maakt (`orderTypes: ["repair", "survey"]`) en de ingang in het klantportaal
(`portal`). De module levert `simulation.run` (een simulatie van P1-meters en deursensoren voor de
demo), `customers.removingSite`, `notifications.rules` en `access.rules`, en declareert het slot
`energy.door` (een plek in de pagina die een andere module vult), die docks vult.

- <SourceLink path="src/modules/energy/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/energy">de map van de module</SourceLink>.
- <SourceLink path="src/modules/energy/docs/ingest.md">ingest.md</SourceLink>: het contract van de feed.
- <SourceLink path="src/modules/energy/server/evaluate.ts">evaluate.ts</SourceLink>: metingen
  tegenover grenswaarden.
- <SourceLink path="src/modules/energy/server/alerts.ts" line={92}>orderAlert()</SourceLink>: een alert
  wordt een opdracht.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
