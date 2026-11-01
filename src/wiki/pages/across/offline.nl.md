---
title: Offline en de service worker
summary: Een service worker laat de kantoorapp direct reageren door te tonen wat hij de vorige keer zag terwijl hij op nieuws controleert; het is geen offline modus.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Dit is deels gebouwd, en de titel belooft meer dan het doet: Fieldworks is geen offline app. Een
service worker (een script dat de browser los van de pagina draait) maakt de kantoorapp snel en komt door
korte onderbrekingen van de verbinding heen. Zonder verbinding werken kan er niet mee.

**Wat je krijgt**

- **Pagina's die je al zag, openen meteen.** Ga terug naar de opdrachtenlijst en hij toont wat hij
  de vorige keer toonde, direct, terwijl de worker de server om nieuwere gegevens vraagt. Is er iets
  veranderd, dan werkt de pagina zich een moment later bij. Tijdens het controleren staat er een
  wolkje met een draaiende pijl in de kopbalk (na een korte wachttijd, zodat een snelle controle
  niet knippert).
- **Hang je met de muis boven een link, dan warmt zijn pagina op.** Tegen de tijd dat je klikt, zijn
  de gegevens van die pagina vaak al vers.
- **De bestanden van de app komen uit de cache van de browser**, dus bij herladen wacht je niet op
  het JavaScript van de app.
- **Je eigen wijzigingen gaan voor.** Nadat je iets hebt opgeslagen, stopt de worker met oudere
  antwoorden tonen en vraagt hij het de server, zodat je nooit gegevens ziet die ouder zijn dan je
  eigen wijziging.
- **Een nieuwe versie meldt zich.** Is er een nieuwe release, dan laadt de volgende navigatie de
  nieuwe versie, en een bericht zegt dat.

**Wat je niet krijgt**

- Niets wat je wijzigt, wordt zonder netwerk opgeslagen. Opslaan of een formulier versturen heeft
  de server nodig, en niets wordt voor later in de wachtrij gezet. Werken in het veld met slecht
  bereik is niet opgelost.
- Valt de verbinding weg, dan toont een deel van een pagina dat mislukt "Je bent offline. Zodra je
  weer online bent, probeert dit het vanzelf opnieuw", en het probeert opnieuw als de browser zegt
  dat hij terug is.
- Alleen de kantoorapp bewaart antwoorden. Elke pagina cachet de bestanden van de app, maar het
  monteursportaal en het klantportaal vragen de worker niet om hun gegevens te bewaren.

<TryIt as="planner" />

<HowItWorks />

De worker is `src/service-worker/index.ts`, die SvelteKit op elke pagina registreert. Hij voert
nooit een remote function (een functie op de server die de pagina direct aanroept) uit; hij speelt
alleen antwoorden opnieuw af. Een remote `query` is een gewone
`GET /_app/remote/<file hash>/<name>?payload=…` met een JSON-antwoord, en een batch query een `POST`
van zijn payloads, bewaard onder een eigen URL.

- **Stale-while-revalidate** (eerst het oude antwoord, dan controleren). Een bewaard antwoord dat
  jonger is dan 15 seconden (`freshFor`), wordt gegeven zoals het is. Een ouder antwoord wordt
  meteen gegeven terwijl de worker de server opnieuw vraagt; verschilt het nieuwe antwoord, dan
  bewaart hij het en meldt het aan het tabblad (`swr:updated`), dat alleen die query bijwerkt. Zie <SourceLink path="src/service-worker/index.ts" line={365}>answerQuery</SourceLink>.
- **Na een wijziging.** Elk ander request (een command, een formulier, inloggen) markeert alles wat
  ervoor is bewaard als verouderd, zodat die queries eerst naar het netwerk gaan. Het verouderde
  bewaarde antwoord wordt alleen gebruikt als de server niet bereikbaar is.
- **Afgebakend.** De kantoorapp vertelt de worker van wie deze gegevens zijn (`swr:scope`:
  gebruiker, organisatie, taal, tijdzone en versie van de app), en elke scope heeft een eigen
  cache. Afmelden of van organisatie wisselen verwijdert die. Zonder scope wordt niets bewaard. Zie <SourceLink path="src/routes/(app)/swr-worker.ts" line={55}>connectSwrWorker</SourceLink>.
- **Opwarmen.** De worker onthoudt welke queries elke pagina deed, en vraagt ze opnieuw op voor de
  pagina's in de zijbalk zodra de shell er is (antwoorden ouder dan een uur), en voor een link als
  je er met de muis boven hangt.
- **Live streams** (`query.live`) gaan er gewoon doorheen; elk antwoord dat van de server binnenkomt,
  telt als een wijziging die het bewaarde veroudert.
- **Fouten.** Een mislukte `fetch` terwijl de browser offline is, wordt ingedeeld als `offline`
  (<SourceLink path="src/lib/errors/classify.ts" line={46}>classify</SourceLink>), en de error
  boundary probeert het opnieuw bij het event `online`.

Het begon als een spike (een snel experiment) voor de app op Vercel en Turso, waar elke navigatie
wachtte op heen-en-weer naar de database, en het mat dat een tweede bezoek daalde van ongeveer
670 ms naar ongeveer 70 ms, met elke remote aanroep 600 ms opgehouden om die rondes na te bootsen.
Het commentaar bovenaan de worker zelf noemt hem nog een experiment.

<DocsPointer doc="docs/plans/service-worker-swr.md" />
