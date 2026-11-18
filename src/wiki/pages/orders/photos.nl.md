---
title: Foto's bij een opdracht
summary: Wie foto's bij een opdracht zet en wanneer, wie ze mag verwijderen, waar ze te zien zijn, en hoe hun bestanden worden bewaard en opgeruimd.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een opdracht kan foto's hebben: van de storing, het typeplaatje, het gedane werk. Drie soorten
mensen voegen ze toe:

- **de klant**, tot vijf als hij in het klantportaal een storing meldt (zie
  [Te accepteren opdrachten](/wiki/orders/awaiting-acceptance));
- **de monteur**, op locatie, vanuit de opdracht in zijn portaal, zolang hij eraan werkt (ingepland,
  onderweg of bezig);
- **het kantoor**, op de pagina van de opdracht, tot de opdracht gefactureerd is.

De telefoon of browser verkleint elke foto voor hij verstuurd wordt, zodat zelfs een grote foto van
een telefoon als een paar honderd kB aankomt. Zonder JavaScript gaan de foto's zoals ze zijn, tot
10 MB per stuk en 25 MB tegelijk.

## Wie een foto mag verwijderen

- **Het kantoor** mag elke foto van een opdracht verwijderen, altijd.
- **Wie een foto toevoegde** (de monteur, het klantcontact) mag hem verwijderen, zolang de opdracht
  nog gedaan moet worden: niet meer als hij afgerond, gefactureerd of geannuleerd is. Een monteur
  die van de opdracht wordt gehaald, kan de zijne niet meer verwijderen.
- Verder niemand, en niemand in een andere organisatie, ziet een verwijderknop of komt langs de
  server.

Elke toegevoegde of verwijderde foto staat in de activiteit van de opdracht, met wie het deed.

## Waar foto's te zien zijn

- De pagina van de opdracht op kantoor, met een fotokaart om ze toe te voegen en te verwijderen.
- De opdracht van de monteur, met dezelfde kaart.
- De pagina van de opdracht bij de klant, op de kaart van zijn melding.
- De servicegeschiedenis van een apparaat: op kantoor kleine miniaturen per opdracht, in het
  monteursportaal (de opdrachten van een gescand apparaat) en het klantportaal (Servicehistorie) een
  aantal per opdracht.

<TryIt as="engineer" /> <TryIt as="planner" />

<HowItWorks />

**Eén tabel, één route.** Elke foto is een rij in `order_photo` (een tenanttabel waarvan de rijen
meegaan als hun opdracht wordt verwijderd), met wie hem toevoegde (`userId`) en zijn plek tussen de
foto's van de opdracht. Het bestand staat in de foto-opslag: de R2-bucket `PHOTOS` op Cloudflare,
elders een map (`PHOTOS_DIR`), onder sleutels die met het id van de tenant beginnen. `/photos/<id>`
geeft een foto alleen aan wie zijn opdracht mag lezen (`servePhoto()`), en anders een 404, ook bij
een ander id.

**Wie wat mag** is de regel `order_photo` van het toegangsregister: een deel van `order`, dus wie
de opdracht leest, leest zijn foto's. De wijziging (verwijderen) is voor het kantoor bij allemaal;
monteurs en klantcontacten krijgen een eigen wijziging via `partOf()` met `changedBy`: van de
opdrachten die ze lezen, de foto's die ze toevoegden, zolang de opdracht in `pendingOrderStatuses`
zit. `photosOf()` zegt elke pagina per foto of de kijker hem mag verwijderen. Toevoegen gaat naar
de wijziging van `order` (het kantoor, of de monteur van de opdracht) en `mayAddPhotos()` voor zijn
status.

**Toevoegen** is `addPhotos` en **verwijderen** `deletePhoto`, één formulier elk voor elke shell
(`forAnyRole`: het register beslist de rest). Toevoegen zet de bestanden eerst weg, buiten de
transactie (`withStoredPhotos()`), want op Cloudflare houdt een transactie elk ander verzoek op;
daarna legt de transactie ze vast en logt ze. Mislukt die, dan worden de opgeslagen bestanden weer
verwijderd. De fotokiezer (`photo-picker.svelte`) verkleint elke foto tot 1600 pixels als JPEG; de
server controleert elk bestand opnieuw op zijn bytes (JPEG, PNG of WebP) en zijn grootte.

**Opruimen.** Een foto of een opdracht verwijderen haalt de rijen weg in een transactie, en daarna
de bestanden, zodra die is vastgelegd. Wat er gemist wordt (een server die ertussenin stopte, een
verwijdering die mislukte, een opdracht die met zijn klant verdween) ruimt `sweepOrderPhotos()` van
de dagelijkse run op: bestanden van de tenant waar geen rij naar wijst, zodra ze een dag oud zijn,
zodat een formulier dat nog verstuurd wordt zijn bestanden houdt. Zowel de map als de bucket kunnen
daarvoor hun bestanden op een voorvoegsel opsommen.

**Verzoekgroottes.** Workers nemen 100 MB per verzoek. Een eigen Node-server (`adapter-node`) neemt
`BODY_SIZE_LIMIT`, 512 KB tenzij ingesteld: zet die op `26M` (README.md).

- <SourceLink path="src/lib/orders/server/photos.ts" line={235}><code>addPhotosLater()</code></SourceLink>
  en <SourceLink path="src/lib/orders/server/photos.ts" line={253}><code>removeOrderPhoto()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={145}><code>withStoredPhotos()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={340}><code>sweepOrderPhotos()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={362}><code>servePhoto()</code></SourceLink>
- <SourceLink path="src/lib/server/access/core.ts" line={121}><code>order_photo</code></SourceLink>
- <SourceLink path="src/lib/orders/photos.remote.ts" line={21}><code>addPhotos</code></SourceLink>
  en <SourceLink path="src/lib/orders/photos.remote.ts" line={29}><code>deletePhoto</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={206} symbol="orderPhoto"><code>order_photo</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Photos" />
