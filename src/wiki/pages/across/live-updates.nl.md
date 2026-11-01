---
title: Live pagina's
summary: Open pagina's werken zichzelf bij als iemand wijzigt wat ze tonen, via één feed van wijzigingen per tabblad.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import LiveFlow from "#wiki/widgets/live-flow/live-flow.svelte";
</script>

In Fieldworks drukt niemand op herladen. Plant een planner een opdracht in, dan werken de pagina
van de opdracht, de opdrachtenlijst, de cijfers op het dashboard en de lijst met het werk van
vandaag van de monteur zich een moment later bij, in elke browser waarin ze openstaan.

- **De pagina van een record** wordt bijgewerkt als het record verandert. Ben je het aan het
  bewerken en slaat iemand anders eerst op, dan meldt een bericht "Gewijzigd door Anouk de Vries,
  1 minuut geleden", met een knop die de nieuwste versie laadt, zodat jouw opslaan die van hen niet
  stilletjes ongedaan maakt.
- **Lijsten, het dashboard en de bellen** kijken opnieuw als er iets verandert van de soorten die
  ze tonen. Een golf aan wijzigingen (een actie op vijftig opdrachten tegelijk) geeft één keer
  bijwerken, niet vijftig.
- **Verborgen tabbladen wachten.** Een lijst of dashboard in een tabblad waar je niet naar kijkt,
  wordt bijgewerkt zodra je terugkomt in dat tabblad.
- **Ieder hoort wat hij mag lezen.** De feed van het monteursportaal vertelt een monteur alleen over
  zijn eigen opdrachten, en de feed van het klantportaal een klantcontact alleen over de eigen
  gegevens. Monteurs en klanten horen niet wie iets wijzigde. Haalt een planner een opdracht weg bij
  een monteur die hem openheeft, dan krijgt de monteur één keer te horen dat hij niet meer van hem
  is, en de pagina sluit zich in plaats van een fout te tonen.

Loop stap voor stap door wat er gebeurt tussen een klik en een bijgewerkte pagina:

<LiveFlow />

<TryIt as="planner" />

<HowItWorks />

Er is één feed per shell (de omgeving van kantoor, monteurs of klanten) en tabblad, niet één live
query per record. SvelteKit houdt de stream van een live query open tot de browser hem opruimt,
waardoor een query per record lekte; de ene gedeelde stream is de oplossing, en een guard spec
(`live-by-subject.spec.ts`) houdt het zo.

1. **Een wijziging wordt gemeld.** `recordActivity()` roept `announceChange()` aan zodra zijn
   transactie gecommit is. Aankondigingen worden in het geheugen bijgehouden: op Cloudflare bedient één
   Durable Object elk request, en op Node één proces. Zie <SourceLink path="src/lib/server/changes.ts" line={65}>announceChange</SourceLink>.
2. **De live query van de shell geeft ze door.** Kantoor heeft `watchTenantChanges`, het
   monteursportaal `watchFieldChanges` en het klantportaal `watchPortalChanges`, elk
   `liveFeed(types, feedFor())`. `feedFor()` houdt alleen de wijzigingen over aan records die de
   kijker mag lezen (dat vraagt het aan de [access registry](/wiki/internals/permissions)) en beslist
   wat zijn publiek hoort: kantoor hoort wie de wijziging maakte en de actie; de anderen alleen of
   het record is bijgewerkt of weg is, zonder de naam. Zie <SourceLink path="src/lib/server/live.ts" line={89}>liveFeed</SourceLink> en <SourceLink path="src/lib/server/live.ts" line={142}>feedFor</SourceLink>.
3. **Het antwoord herhaalt de laatste tien seconden** (`FEED_WINDOW`), omdat een client die alleen
   het laatste antwoord leest anders wijzigingen mist die snel na elkaar kwamen. Hij houdt ze uit
   elkaar aan het moment waarop ze gemaakt zijn.
4. **De layout geeft ze aan de pagina.** `provideChangeFeed()` in de layout van elke shell. Een
   component volgt zijn record met `refreshOnRecordChange(() => ({ type, id }), () => getX(key).refresh())`,
   en een lijst of bel die niet aan één id hangt met `refreshOnActivity(refresh, { types })`. Zie <SourceLink path="src/lib/components/activity/change-feed.svelte.ts" line={26}>provideChangeFeed</SourceLink>
   en <SourceLink path="src/lib/components/activity/live-activity.svelte.ts" line={20}>refreshOnActivity</SourceLink>.
5. **Bijlezen.** Een pagina die geladen werd voordat de stream begon, of terwijl hij opnieuw
   verbinding maakte, vraagt met `getRecordChangedAt` wanneer zijn record het laatst veranderde.
   Een record dat je niet mag lezen, antwoordt 0 en geen fout, dus de vraag verraadt niets over of
   een id bestaat.

De enige live queries buiten de feed van een shell zijn die voor een heel type op een eigen pagina
van een module (`watchSchedule`, `watchEnergy`, `watchDocks`).

<DocsPointer doc="docs/agents/kit.md" section="Staying live" />
