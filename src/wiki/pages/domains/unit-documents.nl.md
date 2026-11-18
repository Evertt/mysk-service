---
title: Handleidingen en documenten
summary: De handleidingen, certificaten, tekeningen en CE-verklaringen van een apparaat, die het kantoor uploadt en die monteurs en klantcontacten op hun telefoon openen.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Bij een apparaat hoort papier: de handleiding van de fabrikant, een keuringscertificaat, een
tekening van hoe het is ingebouwd, de prestatieverklaring met de CE-markering. Fieldworks bewaart
ze bij het apparaat, zodat wie ervoor staat ze op zijn telefoon kan openen.

Elk document heeft een **titel** ("Gebruikershandleiding Crawford SD 4000"), een **soort**
(handleiding, certificaat, tekening, prestatieverklaring / CE, of overig) en zijn bestand: een pdf,
een foto of scan (JPEG, PNG of WebP), of een Word- of Excelbestand, van hoogstens 25 MB.

## Wie doet wat

- **Het kantoor** uploadt documenten op de pagina van het apparaat, in de kaart Documenten: een
  titel, de soort en het bestand. Het hernoemt een document of verandert de soort, en verwijdert er
  een na een vraag. Dat werkt ook zonder JavaScript.
- **De monteurs** zien de documenten van een apparaat bij dat apparaat in hun portaal, waar de
  QR-code ze heen brengt, en tikken er een aan om het te openen.
- **De klantcontacten** openen ze vanaf de pagina van het apparaat in het klantportaal, onder
  **Handleidingen en documenten**, met hoeveel het er zijn. Een klantcontact dat het kantoor voor
  een paar vestigingen uitnodigde, ziet alleen de documenten van de apparaten op die vestigingen.

Een pdf of een afbeelding opent in de browser; een Word- of Excelbestand wordt opgeslagen onder de
naam waarmee het werd geüpload. Niemand anders, en niemand in een andere organisatie, krijgt een
document: een link ernaar is voor hen "niet gevonden".

Elk document dat wordt toegevoegd, hernoemd of verwijderd, staat in de activiteit van het apparaat,
met wie het deed.

<TryIt as="planner" /> <TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**Eén tabel, één route.** Elk document is een rij in `equipment_document`, een deel van zijn
apparaat: een samengestelde foreign key naar `equipment` met de tenant, die met het apparaat
meegaat. Hij bewaart de titel, de soort, de sleutel van het bestand, het type en de grootte, de naam
waarmee het werd geüpload, wie het uploadde en wanneer. Het bestand staat in de bestandsopslag die
de foto's van opdrachten ook gebruiken (de R2-bucket `PHOTOS` op Cloudflare, elders `PHOTOS_DIR`),
onder eigen sleutels: `<tenant>/equipment/<uuid>.<ext>`. `/documents/<id>` geeft het
(`serveUnitDocument()`) met `Content-Disposition: inline` voor een pdf of een afbeelding en
`attachment` voor de rest, de oorspronkelijke naam, en `nosniff`.

**Wie wat mag** is de regel `equipment_document` van het toegangsregister, `partOf("equipment", …)`:
wie het apparaat leest, leest zijn documenten (het kantoor, elke monteur, een klantcontact van de
klant van het apparaat op een vestiging die hij ziet), en wie het apparaat wijzigt (het kantoor),
wijzigt ze. Eén query leest ze in elke shell (`getUnitDocuments`, `forAnyRole`: het register
beslist over het apparaat), de formulieren van het kantoor wijzigen ze (`forMembers`).

**Gecontroleerd op zijn bytes.** Het type dat de browser meestuurt telt niet: de server leest de
eerste bytes van het bestand (`%PDF-`, de handtekeningen van JPEG, PNG en WebP, de ZIP van een
Office-bestand met `word/` of `xl/` erin) en weigert al het andere, of een bestand boven 25 MB,
voordat er iets wordt opgeslagen.

**Bestanden en transacties.** Dezelfde hulpfuncties als bij de foto's
(`#lib/server/files/stored.ts`): de upload zet het bestand eerst weg, buiten de transactie, en
verwijdert het weer als de transactie mislukt (`withStoredFiles()`); een document of zijn apparaat
verwijderen haalt het bestand weg zodra de transactie is vastgelegd (`discardFiles()`, bij het
apparaat via `afterwards` van `defineRemoval()`); `sweepUnitDocuments()` van de dagelijkse run ruimt
bestanden van een dag oud onder het voorvoegsel van de documenten op waar geen rij naar wijst
(`sweepFiles()`), die de opruimronde van de foto's nooit opsomt.

**De demo.** De seed geeft de apparaten van SHLTR een paar kleine pdf's: een handleiding en een
CE-verklaring bij de Sectionaaldeur D-07 bij Riedel, een handleiding, een certificaat en een
tekening bij andere. Hun bestanden gaan naar de lokale opslag; op Cloudflare bereikt de seed de
bucket niet, dus daar staan ze in de lijst maar openen ze pas als ze opnieuw zijn geüpload.

- <SourceLink path="src/lib/equipment/server/documents.ts" line={100}><code>addUnitDocument()</code></SourceLink>
  en <SourceLink path="src/lib/equipment/server/documents.ts" line={173}><code>removeUnitDocument()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/documents.ts" line={246}><code>serveUnitDocument()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/documents.ts" line={224}><code>sweepUnitDocuments()</code></SourceLink>
- <SourceLink path="src/lib/server/files/stored.ts" line={122}><code>sweepFiles()</code></SourceLink>
  en <SourceLink path="src/lib/server/files/stored.ts" line={163}><code>serveStoredFile()</code></SourceLink>
- <SourceLink path="src/lib/server/access/core.ts" line={132}><code>equipment_document</code></SourceLink>
- <SourceLink path="src/lib/equipment/documents/documents.remote.ts" line={33}><code>getUnitDocuments</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/equipment.ts" line={144} symbol="equipmentDocument"><code>equipment_document</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Photos" />
