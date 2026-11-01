---
title: Docks
summary: De live status van docks uit de Salvo-dockhardware, waarbij deuren die openblijven worden gemeld aan de planner en een storingsopdracht worden.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Docks is dock time management voor klanten die het dockbeveiligingssysteem van Salvo gebruiken:
een vergrendeling op het wiel van de vrachtwagen, een bedieningspaneel, een sleutelkast en een
signaallamp (beacon) per dock. De module toont de status van elk dock live, houdt elk bezoek bij,
en let op de sectionaaldeur, want een deur die bij een dock open blijft staan is een
veiligheidsrisico en kost energie. Het menu-item staat in de zijbalk na Apparatuur.

## Wat de module toevoegt

- **Het docksoverzicht** op `/docks`. Elk dock van elke vestiging van een klant, met de status:
  **Vrij**, **Bezet** (er heeft zich een vrachtwagen aangemeld), **Laden** (de wielvergrendeling zit
  erop, de beacon is groen) of **Storing** (het bedieningspaneel heeft een storing, de beacon is
  rood). Het toont ook de beacon, waar de sleutel is (in het bedieningspaneel, bij de chauffeur of
  in de Key Storage), de open sessie met de vervoerder en het kenteken, en de meldingen die de
  deurregels hebben gegeven. Het werkt zichzelf bij als er events binnenkomen.
- **Sessies.** Een aanmelding start een sessie; een afmelding beëindigt hem, en de tijd dat de deur
  in die sessie open stond wordt opgeteld.
- **Deurregels.** Een deur die 40 minuten of langer open staat, wordt oranje en de dockplanner
  krijgt een melding. Bij een uur of langer wordt hij rood, en er wordt een **storingsopdracht**
  gemaakt op de deur van het dock, hoogstens één open opdracht van die soort per deur. Elke stap
  gebeurt één keer per keer dat de deur opengaat.
- **Docks op de pagina van de klant.** Een manager voegt de docks van een vestiging toe op de pagina
  van de klant, waar een kaart ze ook toont met hun live status. Een vestiging van een klant die
  docks heeft, kan niet worden verwijderd.
- **Instellingen.** Een manager maakt de integratietokens waarmee de Salvo-koppeling post.
- **Een demosimulatie.** Voor de demo-tenant bestuurt de app de docks van SHLTR zelf, met een balk
  om af te spelen, te pauzeren en te versnellen.

### Waar je het ziet

- De pagina van een apparaat toont het dockgebruik als het apparaat de deur van een dock is.
- De bel van kantoor gaat bij deuralerts.

### Werkt samen met

- **Energie** (verrijkt): een bewaakte deur die ook de deur van een dock is, toont de status van
  het dock op de deurkaart van Energie. Zie [Energie](/wiki/modules/energy).

Docks hebben niets nodig.

<TryIt as="planner" />

<HowItWorks />

Docks is de module voor iets dat van buiten wordt gevoed. De hardware van Salvo (of wat die
doorgeeft) post batches van events, `check_in`, `lock`, `unlock`, `door_open`, `door_close`,
`key_moved`, `scp_fault`, `scp_ok` en `check_out`, naar `POST /docks/ingest` met een bearer token.
De route staat in de route group `(api)` van de module, die de app doorlaat zonder sessie; de stub
bewaakt de handler met `guardedIntegration()`: een ontbrekend of ingetrokken token geeft een 401,
een tenant zonder de module een 404, en daarna draait de handler als het systeem in de tenant van
het token. `jsonIngest()` antwoordt 415, 413, 400 en 422 in de vorm die de feed van elke module
gebruikt.

Een batch wordt eerst in zijn geheel gevalideerd en dan in één transactie toegepast, in de
volgorde van de tijden van de events. Een event-id dat al eerder binnenkwam, wordt overgeslagen,
dus een batch die twee keer wordt gestuurd, wordt één keer toegepast, en een event dat ouder is dan
het laatste bij zijn dock wordt vastgelegd maar niet toegepast. De status van het dock is een pure
functie van de events (`applyEvent()` in `model.ts`). Daarna draaien de deurregels, in een
transactie per dock, zodat een dock waarbij het misgaat de andere niet ophoudt. Ze draaien ook als
de feed een lege batch post, als hartslag, en in de dagelijkse taak, die ook oude events opruimt.

De module haakt op deze punten in op de kern, in `server/index.ts`: `jobs.daily` voor de
deurregels, `simulation.run` voor de demo, `customers.removingSite` als stem tegen het verwijderen
van een vestiging met docks, `notifications.rules` voor de bel en `access.rules`. Een
storingsopdracht wordt gemaakt via `createOrders()`, en de module declareert `orderTypes:
["breakdown"]`, die een tenant niet kan verbergen zolang hij aan staat. Het volledige contract van
de events staat in de eigen docs van de module.

- <SourceLink path="src/modules/docks/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/docks">de map van de module</SourceLink>.
- <SourceLink path="src/modules/docks/docs/salvo-events.md">salvo-events.md</SourceLink>: het
  contract van de feed.
- <SourceLink path="src/modules/docks/model.ts" line={164}>applyEvent()</SourceLink>: een event
  verandert de feiten van een dock.
- <SourceLink path="src/modules/docks/server/rules.ts" line={111}>checkDoors()</SourceLink>: de
  deurregels.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
