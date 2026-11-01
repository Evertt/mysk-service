---
title: Rechten en de access registry
summary: Eén plek beantwoordt "mag deze gebruiker dit record lezen of wijzigen?", voor pagina's, lijsten, het activiteitenlog en de live feeds tegelijk.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Wie je bent, bepaalt welke records je bereikt, niet alleen welke pagina's je opent. De regels zijn
dezelfde waar een record ook opduikt: op zijn pagina, in een lijst, in het activiteitenlog, in een
bel, in een live update.

| Wie                                | Leest                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Kantoor** (planners)             | De records van de organisatie, voor de modules die de organisatie heeft.                                                         |
| **Managers** (eigenaar, beheerder) | Ook wat alleen managers zien: leden, uitnodigingen, de portaaltoegang van een klant en integratietokens.                         |
| **Een monteur**                    | De opdrachten die aan hem zijn toegewezen, en elk apparaat en elke locatie, want de QR-code van de buren scannen is het product. |
| **Een klantcontact**               | De opdrachten, apparaten en vestigingen van de eigen klant, en alleen de vestigingen die hij kreeg.                              |

Wat je niet mag lezen, wordt niet verborgen achter een foutmelding: het wordt niet gevonden. Het
activiteitenlog en de bellen laten logregels weg over records die je niet mag lezen. Records van een
module die de organisatie heeft uitgezet, verdwijnen van elk scherm, en komen terug, met
geschiedenis en al, als hij weer aangaat.

Wijzigen is een aparte vraag, los van lezen. Een record kan van jou zijn om te lezen maar niet om
te wijzigen, en zelfs een record dat je mag wijzigen, heeft eigen regels over welke statusstappen
nu mogen: die blijven in de levenscyclus van de opdracht.

<TryIt as="engineer" />

<HowItWorks />

Er worden twee vragen gesteld, op twee plekken:

- De [gate](/wiki/internals/gates) beslist wie een functie mag **aanroepen**.
- De **access registry**, `#lib/server/access`, beslist welke **records** die aanroeper bereikt.

De registry heeft één set regels per subject type (een opdracht, een apparaat, een klant, de
checklist van een module) en per publiek (`office`, `engineer`, `customer`, `system`). Een publiek
zonder regel voor een type leest er niets van: standaard geweigerd. De gebruiker is het publiek van de
gate die het request toeliet, dus een lid dat zowel beheerder als monteur is, is de monteur in de
functies van het monteursportaal.

Elke regel is een SQL-voorwaarde, gebouwd uit de scopes per publiek die al bestaan
(`engineerOrders()`, `customerOrders()`, `inTenant()`), dus de voorwaarde van de `scope` van een
lijst en het antwoord op "mag dit klantcontact opdracht 12 lezen?" zijn dezelfde voorwaarde. Drie
makers bouwen een set regels:
`rows(table, idColumn, byAudience)` voor een type met een rij, `partOf(parentType, table,
parentColumn)` voor een onderdeel dat zijn bovenliggend record volgt, en `tenantWide(byAudience)`
voor een type zonder rij. Zie <SourceLink path="src/lib/server/access/rules.ts" line={132}>rows</SourceLink>
en <SourceLink path="src/lib/server/access/core.ts">de regels van de kern</SourceLink>.

Code vraagt het met:

- `mayRead(subject)` en `readOrNotFound(subject)` voor één record. Zie <SourceLink path="src/lib/server/access/index.ts" line={78}>mayRead</SourceLink>.
- `readable(subjects)` voor een reeks, `readableTypes()` voor de types die de gebruiker überhaupt
  leest.
- `visible(type)` en `visibleOrNone(type)` voor de voorwaarde van de gebruiker op een tabel, voor de
  `scope` van een lijst, een join of een subquery. `visibleOrNone` is voor een `where`, waar een
  `undefined` binnen `and()` alles zou doorlaten.
- `mayChange`, `changeOrNotFound`, `changeable` voor wijzigingen.

Een module voegt de regels voor zijn eigen subject types toe in `server/access.ts`, aangemeld in
zijn `server/index.ts` met `contribute(accessRules, () => rules)`, en heeft geen regels voor types
die niet van hem zijn. Een module die de tenant (de organisatie) niet heeft, voegt er geen toe,
dus zijn records worden niet gevonden.

**Bewaakt.** `access.spec.ts` mislukt als een type dat gelogd wordt geen regel heeft (of een regel
voor een type is dat niemand logt), als een bestand dat het log leest of wijzigingen doorgeeft de
registry niet gebruikt, als een `*.remote.ts` subjects van een module met de hand controleert, als
een portaal een tabel met een regel alleen op de tenant beperkt, en als een rolnaam wordt
vergeleken buiten de bestanden die de rollen beheren.

**Feeds.** `feedFor(viewer)` filtert de feed van wijzigingen van een shell (de omgeving van kantoor,
monteurs of klanten) met `readable()` en
beslist wat elk publiek van een wijziging hoort. Haalt een wijziging een record weg bij iemand die
het kende (een opdracht van zijn monteur), dan krijgt die één wijziging `access_revoked`, daarna
is het record onleesbaar en sluit de open pagina. Zie [live updates](/wiki/across/live-updates).

Het ontwerp, de beslissingen en de stappen waarin het gebouwd is, staan in
`docs/plans/permissions.md`.

<DocsPointer doc="docs/agents/kit.md" section="Permissions" />
