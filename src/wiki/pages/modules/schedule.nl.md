---
title: Planning
summary: Het planbord dat zegt wie welke opdracht doet, en wanneer, per week, maand en dag.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

In de planning maakt een planner van open opdrachten een plan. Het menu-item staat in de zijbalk
direct na Opdrachten.

## Wat de module toevoegt

- **Het weekbord.** Een raster van monteurs tegen dagen, met de opdrachten van de week als kaarten.
  Ernaast staat **Nog in te plannen**: de open opdrachten zonder datum, de dringendste eerst (op
  prioriteit, dan op leeftijd). Op een smal scherm is het bord geen raster maar een lijst per dag.
- **Plannen met slepen.** Sleep een kaart uit Nog in te plannen naar de dag van een monteur, of van
  het ene vak naar het andere om hem te verplaatsen. De kaart verschuift meteen, en gaat terug met
  een bericht als de wijziging wordt geweigerd. Een ingeplande opdracht krijgt de tijd 09:00, tenzij
  je een andere kiest.
- **Plannen met een dialoog.** Elke kaart heeft ook **Inplannen…**, een dialoog met een monteur,
  een datum en een tijd, die de problemen van de opdracht bij de velden toont. Op een smal scherm,
  waar je kaarten niet kunt slepen, plan je zo.
- **Maand- en dagweergave.** Wissel de weergave tussen Week, Maand en Dag. De maand is een kalender
  met de opdrachten van elke dag, in kleur per soort opdracht met een legenda, en een link "+n meer"
  voor een volle dag. De dagweergave toont wie wat doet, en wanneer.
- **Overboekt.** Een monteur met meer dan drie opdrachten op een dag wordt als overboekt gemarkeerd.
- **Live.** Als iemand anders een opdracht inplant, een monteur er een afrondt of er een opdracht
  binnenkomt, ververst een open bord zichzelf.

Geannuleerde opdrachten staan niet op het bord. Een opdracht inplannen is de stap **plan** uit de
levenscyclus van de opdracht: een opdracht met de status Nieuw die een monteur krijgt, wordt
Ingepland, en een opdracht met een andere open status houdt zijn status. Wat inplannen elders in
gang zet, zoals voorraad van materialen die apart wordt gezet, gebeurt hier ook.

### Werkt samen met

Planning heeft niets nodig en verrijkt niets, en geen andere module hangt ervan af.

<TryIt as="planner" />

<HowItWorks />

De planning is de enige module **zonder eigen tabellen**: hij is een weergave van de opdrachten, en
wijzigt ze alleen via een service van de kern. Hij is eigenaar van zijn route, zijn componenten en
zijn berichten, en verder niets: geen map `server/`, geen hooks en geen slots.

De gegevens van het bord komen uit twee queries in `schedule.remote.ts`. `getSchedule` geeft de
monteurs, de opdrachten die in de week van maandag tot zondag zijn ingepland en wat nog ingepland
moet worden; `getScheduleMonth` geeft de zes weken van een maand, die de server vastlegt zodat geen
request meer laadt. Elke opdracht wordt gekoppeld aan zijn klant en zijn eerste apparaat (met hoeveel
apparaten hij heeft), en de specialismen die bij zijn apparaten horen, zodat de dialoog de monteurs
die erbij passen als eerste kan tonen. Beide zijn beperkt tot de tenant, zoals elke andere query.

Inplannen loopt via `transitionOrder()` met het werkwoord `plan`, in een transactie: dat is de enige
plek die de status van een opdracht wijzigt, dus die weigert een opdracht die niet open is, een
probleem met de monteur of een voorraadtekort, net als het opdrachtformulier. De dialoog
(`scheduleOrder`) is een form; slepen (`moveOrder`) is een command (twee soorten remote functions,
functies op de server die een pagina direct aanroept). Na beide wordt de query van het bord
ververst. `watchSchedule` is een live query over de soorten gegevens die het bord toont (`order`,
`engineer`, `customer`), die bij elke wijziging een tijdstempel stuurt zodat een open pagina
opnieuw leest. Het slepen is van de client zelf: die voert de verplaatsing optimistisch uit en
draait hem terug bij een fout (`board-drag.svelte.ts`).

- <SourceLink path="src/modules/schedule/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/schedule">de map van de module</SourceLink>.
- <SourceLink path="src/modules/schedule/schedule.remote.ts" line={103}>getSchedule()</SourceLink> en <SourceLink path="src/modules/schedule/schedule.remote.ts" line={162}>moveOrder()</SourceLink>: de
  gegevens en de wijziging.
- <SourceLink path="src/modules/schedule/board/board-drag.svelte.ts">board-drag.svelte.ts</SourceLink>:
  slepen.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
