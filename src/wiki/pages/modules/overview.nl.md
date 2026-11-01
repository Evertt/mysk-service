---
title: Overzicht van de modules
summary: De elf optionele modules, hoe een tenant ze aan- en uitzet, en wat van wat afhangt.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import ModuleMap from "#wiki/widgets/module-map/module-map.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Fieldworks heeft een kern: opdrachten, klanten, apparatuur en monteurs, met daaromheen de
kantoorapp, het monteursportaal en het klantportaal. Al het andere is een **module**, een functie
die een tenant (een organisatie in de app) aan of uit kan zetten. Een tenant die nooit onderhoud
plant, heeft geen onderhoudspagina's, geen onderhoudskolommen en geen onderhoudstaken. Bij SHLTR,
de demo-tenant, staan ze alle elf aan.

## De kaart

Zet hieronder een module uit en zie wat er meegaat. Modules met een lijn naar een andere module
**hebben die nodig**: zonder werken ze niet, dus gaan ze samen uit.

<ModuleMap />

## De elf

| Module                                              | Waar het voor is                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| [Werkbonnen](/wiki/modules/checklists)              | Een checklist per apparaat bij inspectie- en onderhoudsopdrachten.        |
| [Onderdelenbeheer](/wiki/modules/condition)         | De conditie van elk apparaat en onderdeel door de tijd, en de status.     |
| [Servicecontracten](/wiki/modules/contracts)        | Gedekt werk is gratis; reactietijden worden bewaakt.                      |
| [Docks](/wiki/modules/docks)                        | De live status van docks uit Salvo-hardware, en deuren die openstaan.     |
| [Energie](/wiki/modules/energy)                     | Vermogen en verbruik per zone, grenswaarden, alerts.                      |
| [Facturatie](/wiki/modules/invoices)                | Facturen en creditnota's voor afgeronde opdrachten en vergoedingen.       |
| [Onderhoudsplannen](/wiki/modules/maintenance)      | Bezoeken op een vast interval, die opdrachten worden.                     |
| [Materialen](/wiki/modules/materials)               | Onderdelen en verbruiksartikelen, hun prijzen en voorraad.                |
| [Partnerprogramma](/wiki/modules/partner-programme) | Een jaarlijkse bonus voor partners, als cash of als Parts Credit.         |
| [Onderdelen Shop](/wiki/modules/parts-shop)         | Partners bestellen onderdelen in het portaal en betalen met Parts Credit. |
| [Planning](/wiki/modules/schedule)                  | Wie welke opdracht doet, en wanneer: per week, maand en dag.              |

## Modules aan- en uitzetten

Een manager (een eigenaar of een beheerder) zet modules aan op de pagina **Instellingen**, onder
Modules. Elke module heeft een knop Inschakelen of Uitschakelen, een korte omschrijving en de datum
waarop hij is ingeschakeld. De pagina doet wat de kaart zegt:

- Een module inschakelen schakelt ook in wat hij **nodig heeft**. De dialoog zegt het: "Schakelt
  ook ... in."
- Een module uitschakelen schakelt ook uit wat **hem nodig heeft**: "Schakelt ook ... uit, die dit
  nodig hebben."
- Een wijziging waardoor een module zou missen wat hij nodig heeft, wordt geweigerd, met de namen
  van de modules erbij.

Een module uitzetten verbergt hem. Er wordt niets verwijderd: de tabellen en gegevens blijven, dus
zet je hem weer aan, dan is alles terug. Intussen geven de pagina's en gegevens van de module "niet
gevonden", zijn het menu-item in de zijbalk, de dashboardkaarten, kolommen en bulkacties verdwenen,
draaien de dagelijkse taken niet en zijn de gegevens niet te vinden in het activiteitenlog of de
feeds. Twee modules, Docks en Energie, houden zelfs tegen dat een vestiging van een klant wordt
verwijderd zolang ze daar gegevens hebben, en vragen je ze eerst weer aan te zetten.

## Nodig hebben en verrijken

Het manifest van een module (het bestand dat de module beschrijft) kan twee dingen zeggen over
andere modules.

- **requires** (nodig hebben): zonder de andere werkt hij niet. Partnerprogramma heeft
  Facturatie nodig (zijn cijfers zijn de betaalde facturen van de partners). Onderdelen Shop
  heeft Materialen nodig (zijn artikelen zijn materialen, met hun voorraad) en Partnerprogramma
  (je betaalt er met het credit van de partners).
- **enhances** (verrijken): hij doet meer als de andere aan staat, en werkt prima zonder. Werkbonnen
  verrijkt Onderdelenbeheer en Onderdelen Shop: met Onderdelenbeheer aan gaat de keuringsstatus
  van een apparaat mee in zijn conditie, en met Onderdelen Shop aan stelt een afgekeurd punt het
  onderdeel voor dat het oplost.

Alleen `requires` bepaalt wat er aan staat. Zet je een module uit die een andere alleen verrijkt,
dan blijft die andere gewoon werken en laat hij alleen het extraatje niet meer zien.

<TryIt as="planner" />

<HowItWorks />

Elke module is een map, `src/modules/<id>/`, die op zichzelf staat: het manifest `module.ts`, een
map `server/` met de tabellen, seed (de demogegevens) en hooks, de `routes/` (een pagina daarin
wordt geserveerd onder de eigen URL van de module, `/<id>`), componenten, berichten in het Engels
en Nederlands, en tests. Een generator (`scripts/modules.ts`) leest de mappen en schrijft de
registers die de app gebruikt: de lijst en de graaf van de modules, hooks, slots, kolommen,
formulieronderdelen, seeds en de route-stubs. De `requires` en `enhances` van het manifest worden
uit de brontekst gelezen, dus de graaf kan niet uit de pas lopen met de code.

De modules van een tenant zijn rijen in `organization_module`. Als een request de tenant laadt,
maakt `effectiveModules()` van die rijen wat er echt aan staat: het voegt de modules toe die altijd
aan staan, en laat dan elke module vallen waarvan niet alles wat hij nodig heeft aan staat, tot er
niets meer verandert. `enhances` speelt daarbij geen rol. Het instellingenformulier, `setModules`,
vraagt eerst `changeModules()` en weigert wat een vereiste zou breken, zodat de rijen kloppen.

De kern importeert nooit een module. Een module komt op pagina's van de kern via **extension
points** (plekken waar de kern ruimte laat voor modules: slots, kolommen, bulkacties, hooks en
meer), en elk doet alleen mee voor tenants die de module hebben. Alle remote functions van een
module (functies op de server die een pagina direct aanroept) worden gemaakt met
`moduleRemote("<id>")`, dat een 404 geeft aan een tenant zonder de module.

- <SourceLink path="src/lib/modules/graph.ts" line={28}>effectiveModules()</SourceLink> en <SourceLink path="src/lib/modules/graph.ts" line={99}>changeModules()</SourceLink>: wat er aan
  staat, en wat een wijziging mag.
- <SourceLink path="src/lib/modules/define.ts" line={16}>defineModule()</SourceLink>: het manifest.
- <SourceLink path="src/lib/server/auth/session.ts" line={259}>requireModule()</SourceLink>: de
  poort voor de pagina's en gegevens van een module.
- <SourceLink path="scripts/modules.ts">scripts/modules.ts</SourceLink>: de generator.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
