---
title: Dashboard
summary: De startpagina van kantoor, met de cijfers van de dag, het eerstvolgende ingeplande werk, drie grafieken en wat er net is gebeurd.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een planner komt na het inloggen op het dashboard. Het begint met een groet die past bij het
moment van de dag, en een rij tegels:

- **Open opdrachten**: opdrachten die nieuw, ingepland of in behandeling zijn, hoeveel daarvan nog
  geen monteur hebben, en hoeveel opdrachten er de laatste zeven dagen zijn gemaakt, tegenover de
  zeven dagen daarvoor.
- **Te accepteren**: opdrachten die klanten in hun portaal hebben gemeld. De tegel is een link naar
  de opdrachtenlijst, gefilterd op die opdrachten.
- **Spoed**: open opdrachten met de prioriteit "spoed".
- **Omzet**: het afgeronde werk van de laatste dertig dagen, geprijsd zoals overal, tegenover de
  dertig dagen daarvoor.
- **Apparatuur die aandacht nodig heeft**: apparaten die onderhoud nodig hebben of buiten gebruik
  zijn, van alle apparaten.

Onder de tegels staan kaarten: de volgende zes ingeplande opdrachten met klant, apparaten, monteur
en prioriteit, een grafiek van de apparaten naar status, de omzet per maand, de opdrachten die per
week zijn gemaakt naar status, en de laatste activiteit. De kaarten staan in kolommen, dus de
pagina heeft één kolom op een telefoon, twee op een laptop en drie op een breed scherm.

Zet een module aan en het dashboard groeit mee. Materialen voegt een tegel voor lage voorraad toe,
Onderdelenbeheer en Energie hun eigen tegels, de Onderdelen Shop zijn open bestellingen;
Servicecontracten, Facturatie, Onderhoudsplannen en het Partnerprogramma voegen elk een kaart toe.
Een tenant (een organisatie in de app) zonder een module ziet de tegel ervan nooit.

De cijfers zijn live: als iemand in de organisatie iets wijzigt, vragen de tegels, de grafieken en
de recente activiteit opnieuw op ([live updates](/wiki/across/live-updates)). Monteurs en klanten
hebben hun eigen startpagina en zien deze nooit.

<TryIt as="planner" />

<HowItWorks />

De pagina vraagt zijn gegevens op in twee queries, `getDashboard` (de tegels en de komende
opdrachten) en `getCharts`, allebei achter de gate `forMembers`, en elke select
erin is beperkt met `inTenant()`. De omzet is geen som in SQL: elke afgeronde opdracht wordt geprijsd
met `priceOrders()`, omdat de modules prijzen aanpassen. Zie <SourceLink path="src/routes/(app)/(dashboard)/dashboard.remote.ts" line={25}>getDashboard</SourceLink>.

Modules komen op de pagina via twee slots (plekken waar een module iets in kan zetten) in <SourceLink path="src/lib/dashboard/extensions.ts" line={9}>dashboard.stats</SourceLink> (elk een
`StatTile`) en <SourceLink path="src/lib/dashboard/extensions.ts" line={17}>dashboard.cards</SourceLink>.
Een module zet een component in `slots/dashboard.stats/` of `slots/dashboard.cards/`, en dat laadt
zijn eigen gegevens met de remote functions van de module. Elke bijdrage staat in een eigen error
boundary, dus een kaart die een fout geeft, toont een melding en de rest van de pagina gaat gewoon
door. Een kaart die ruimte nodig heeft, zet `data-wide` op zijn root en beslaat twee kolommen waar
er twee zijn.

De tegels gebruiken `<StatTile>` en zijn trend (`compare()` in `stat-trend.ts`), die beslist of een
verandering goed nieuws is, slecht nieuws of geen van beide: meer gemaakte opdrachten is geen van
beide, meer omzet is goed. De grids worden gedeeld met het laadskelet van de pagina
(`dashboard-grids.ts`), zodat de omtrek dezelfde kolommen laat zien voordat de gegevens er zijn.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
