---
title: Activiteitenlog
summary: Elke wijziging aan een record wordt vastgelegd, met wie hem maakte en wat er veranderde, en de live pagina's en de bellen van de app zijn erop gebouwd.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Elke keer dat iemand iets aanmaakt, wijzigt of verwijdert, schrijft Fieldworks een logregel in het
log: wie het deed, wat er gebeurde, bij welk record, en bij een wijziging welke velden van wat naar
wat gingen ("status: nieuw → ingepland"). Werk dat het systeem zelf doet, zoals een dagelijkse taak
die een opdracht maakt uit een onderhoudsplan, komt er ook in, als "Fieldworks (automatisch)".

Je komt het log op drie plekken tegen:

- **Bij een record.** De pagina van een opdracht, klant, apparaat of monteur heeft een
  activiteitenkaart met de geschiedenis van dat record, en die van zijn onderdelen: de posten van
  een opdracht staan op de kaart van de opdracht.
- **De pagina Activiteit** op kantoor toont alles. Beperk de lijst tot een soort record, één record,
  een persoon of een periode. De eerste pagina blijft live: wat iemand wijzigt terwijl jij kijkt,
  verschijnt bovenaan. Op een pagina verder terug blijven de logregels staan waar ze staan, en de
  pagina meldt hoeveel er sindsdien bij zijn gekomen, met een link ernaartoe.
- **De kaart Recente activiteit** op het dashboard toont de laatste paar.

Twee dingen volgen uit hoe het log wordt bijgehouden. Een formulier dat je opslaat zonder iets te
veranderen, logt niets, dus het log raakt niet vol met lege "bijgewerkt"-regels. En er komt nooit
een logregel voor een wijziging die geweigerd of teruggedraaid is: wat het log zegt dat er gebeurde,
is ook echt gebeurd.

Het log is ook de bron van de [meldingen](/wiki/across/notifications) in de bel, en wat open
pagina's vertelt dat ze [moeten bijwerken](/wiki/across/live-updates).

<TryIt as="planner" />

<HowItWorks />

`recordActivity(tx, { action, subject, before, after })` wordt aangeroepen binnen dezelfde
`db.transaction` die de wijziging maakt, na de wijziging. Omdat het die transactie gebruikt, neemt
een rollback (het terugdraaien van de transactie) de logregel mee. Zie <SourceLink path="src/lib/server/activity/log.ts" line={120}>recordActivity</SourceLink>.

- **`action`** is een van de `activityActions` (`created`, `updated`, `deleted`, of een werkwoord
  dat meer zegt: `scheduled`, `work_started`, `stock_received`). Een nieuwe krijgt ook een zin in
  de messages (de vertaalde teksten).
- **`subject`** is het record: zijn type, id en het label waaronder het nu bekend is (een
  opdrachtnummer). Het label wordt opgeslagen, zodat een logregel nog klopt nadat het record een
  andere naam kreeg of verwijderd is. Een `parent` zet de logregel ook op de kaart van een ander
  record.
- **`before` en `after`** geven het verschil bij een wijziging. Alleen de velden van `after` worden
  vergeleken, dagen en momenten als ISO-strings, en niets, `null` en `""` tellen als gelijk. Is er
  niets anders, dan logt de functie niets en geeft `false` terug. Zie <SourceLink path="src/lib/server/activity/log.ts" line={83}>diff</SourceLink>.
- **Wie:** de tenant (de organisatie) en de gebruiker komen uit het request. Een wijziging door
  het systeem (`asSystem()`) wordt opgeslagen zonder gebruiker en met een lege naam. De logregels van
  een verwijderde gebruiker houden zijn naam.
- **Wijzigingen buiten onze transacties** (de endpoints van better-auth voor leden en
  uitnodigingen) worden gelogd met `recordActivityAfter()` zodra ze gelukt zijn.

De logregel komt in de tabel `activity`, een tenant-tabel als alle andere: hij heeft de organisatie,
en een index per subject en per parent. Zodra de transactie is gecommit, meldt dezelfde aanroep de
wijziging aan de live queries (`announceChange()`), en dat is het verhaal van de volgende pagina.

Het log wordt gelezen via de [access registry](/wiki/internals/permissions): de pagina Activiteit
en de feeds tonen alleen logregels over records die de gebruiker mag lezen, en laten de types weg van een
module die de tenant heeft uitgezet. Die logregels blijven in de database; zet de module weer aan en
ze komen terug.

Een nieuw soort record krijgt zijn zelfstandig naamwoord, zijn pagina en de opmaak van zijn velden
in `coreSubjectTypes` (`src/lib/activity/subjects.ts`), of voor de records van een module in de
`subjects` van zijn manifest. Zijn detailpagina toont dan `<ActivityCard type id />`.

<DocsPointer doc="docs/agents/database.md" section="Activity log" />
