---
title: Lijsten
summary: Elk onderdeel is een tabel die je kunt doorzoeken, filteren, sorteren, groeperen en bewaren, en de browser of de server doet het werk.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import ListPlayground from "#wiki/widgets/list-playground/list-playground.svelte";
</script>

Opdrachten, klanten, apparaten, monteurs en de records van de modules (facturen, contracten,
materialen) openen allemaal als een lijst, en elke lijst werkt op dezelfde manier. Dat is met
opzet: ken je er één, dan ken je ze allemaal.

- **Zoeken** kan met meer woorden. Elk woord moet in een van de kolommen staan, hoofdletters of
  niet, dus "bakker tiel" vindt de klant Bakker in Tiel.
- **Filters** zitten achter de knop Filter. Elk actief filter wordt een chip boven de tabel, en
  Wissen haalt ze weg. Datums en bedragen filter je op een bereik (`this-week..next-month`, `..10`).
- **Sorteren en groeperen.** Klik op een kolomkop om te sorteren. Groepeer op een kolom zoals status
  of klant, en elke groep krijgt een kopregel met het aantal (en totalen, waar een kolom die heeft).
  Groepen klap je in.
- **Kolommen, dichtheid en weergaven.** Verberg kolommen, zet de rijen dichter op elkaar of ruimer,
  en bewaar een set filters en sortering als weergave, voor jezelf of gedeeld met het kantoor.
- **De tabel bewaart zijn stand in de adresbalk.** Kopieer de link en een collega ziet dezelfde
  gefilterde, gesorteerde lijst. Kom je later terug, dan staat de lijst zoals je hem achterliet.
- **Selecteer rijen** om er iets mee te doen: wijs tien opdrachten tegelijk aan een monteur toe,
  wijzig hun status of verwijder ze. In een lange lijst kun je alles selecteren wat aan de filters
  voldoet, niet alleen de rijen op het scherm.
- **Rijen laden terwijl je scrolt** in de lijsten die de server per pagina aanlevert (opdrachten,
  apparatuur, en bij de modules materialen, partners, apparaten naar conditie en onderhoud dat
  eraan komt), dus een lijst van duizenden opent even snel als een van tien.

Probeer het zoeken, het statusfilter en het groeperen op 25 verzonnen opdrachten:

<ListPlayground />

Dit is een miniatuur. De echte tabel bewaart ook zijn stand in de adresbalk, heeft opgeslagen
weergaven, kolommen die je kunt verbergen en acties op een selectie, en die horen bij de organisatie
van een ingelogde gebruiker, dus de openbare wiki neemt hem niet op.

<TryIt as="planner" />

<HowItWorks />

Een lijst wordt één keer gedefinieerd en in beide modi op dezelfde manier gebouwd:

- **Serverlijsten** (de standaard, voor lijsten die groeien: opdrachten, apparatuur) laten de
  database zoeken, filteren, sorteren en pagineren. De tabel vraagt een pagina rijen op terwijl je
  scrolt.
- **Clientlijsten** (`mode: "client"`, voor kleine: klanten, monteurs, contracten, facturen) laden
  alle rijen één keer, en de browser doet alles meteen. De definitie van de lijst zegt welke modus
  het is; zet een lijst niet op de server tenzij hij te groot wordt om in zijn geheel te laden.

De onderdelen, in de volgorde waarin een lijst wordt gebouwd:

1. **`defineList()`** in `list/<section>-list.ts` noemt elke kolom en waarop hij sorteert,
   groepeert en filtert, en maakt daaruit de grammatica van de URL.
   Zie <SourceLink path="src/lib/components/data-table/list-definition.ts" line={350}>defineList</SourceLink>.
2. **`withListColumns()`** bouwt de kolommen van de tabel uit die definitie, zodat een kolom nooit
   opnieuw hoeft te zeggen of hij sorteert of filtert.
3. **`createServerTable()`** of **`createClientTable()`** maakt de tabel. Zie <SourceLink path="src/lib/components/data-table/table.svelte.ts" line={336}>createClientTable</SourceLink>.
4. **`<ListLayout>`** en **`<ListToolbar>`** tekenen de toolbar, de filters uit de definitie, de
   rijen en de balk met acties op de selectie.
5. Op de server zet **`planList()`** de query uit de URL om in SQL voor de rijen, de aantallen en de
   filteropties. Zie <SourceLink path="src/lib/server/lists/plan.ts" line={493}>planList</SourceLink>.

De opdrachtenlijst (<SourceLink path="src/lib/orders/list/orders-list.ts">orders-list.ts</SourceLink>)
is het voorbeeld voor de server, de klantenlijst
(<SourceLink path="src/lib/customers/list/customers-list.ts">customers-list.ts</SourceLink>) dat
voor de client. Een guard spec (een test die de broncode leest), `src/tests/unit/lists.spec.ts`,
weigert een tabel of toolbar die met de hand is gebouwd, en noemt het bestand en de regel.

Modules voegen kolommen toe aan een lijst van de kern (de apparatuurlijst krijgt de kolommen van de
modules Onderdelenbeheer, Onderhoudsplannen en Werkbonnen, voor een organisatie die die modules
heeft) via een extension point; zie [extension points](/wiki/internals/extension-points).

<DocsPointer doc="docs/agents/lists.md" />
