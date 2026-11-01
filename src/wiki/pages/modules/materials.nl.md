---
title: Materialen
summary: Onderdelen en verbruiksartikelen met prijzen en voorraad, en wat opdrachten ervan gebruiken.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Materialen is de catalogus van onderdelen en verbruiksartikelen, elk met een prijs en een
voorraad, en de koppeling tussen die artikelen en de opdrachten die ze gebruiken. Het menu-item
staat in de zijbalk na Monteurs.

## Wat de module toevoegt

- **Een catalogus.** Elk materiaal heeft een artikelnummer, een naam, een eenheid (stuks, meter,
  kilogram of liter), een lijstprijs per eenheid en een voorraad. Een prijs wijzigen raakt
  bestaande opdrachten niet: die houden de prijs waarvoor ze geoffreerd zijn. Een materiaal dat op
  een opdracht staat, kan niet worden verwijderd.
- **Een voorraadboek.** Voorraad wordt nooit bewerkt, hij beweegt. Elke wijziging is een mutatie:
  de beginvoorraad, **Ontvangen**, een **telcorrectie** (je vult in wat je hebt geteld en het
  verschil wordt vastgelegd), **Verbruikt op opdracht**, **Retour van opdracht**, en met de
  onderdelenshop **Gereserveerd voor bestelling** en **Vrijgegeven van bestelling**. De pagina van
  een materiaal toont de historie, de nieuwste eerst, en welke opdrachten het gebruiken. Een
  voorraad staat als **Op voorraad**, **Laag** (onder 10 stuks, of 50 meter, kilogram of liter) of
  **Niet op voorraad**.
- **Materialen op opdrachten.** Het opdrachtformulier krijgt een onderdeel materialen: regels met
  een materiaal en een aantal. De materialen zijn een **kostenpost** in de prijs van de opdracht,
  dus het totaal van de opdracht, de factuur en het dashboard tellen ze mee. Het aantal moet passen
  bij de eenheid van het materiaal.
- **De voorraad volgt de status.** Een opdracht houdt de voorraad van zijn materialen vast **vanaf
  Ingepland**: Ingepland, In behandeling, Afgerond en Gefactureerd. Een opdracht met de status
  Nieuw, een opdracht die nog geaccepteerd moet worden en een geannuleerde opdracht houden niets
  vast. Inplannen neemt de voorraad, annuleren geeft hem terug, en de opdracht verwijderen geeft
  terug wat hij nam. Is er niet genoeg, dan wordt de wijziging geweigerd met een bericht als "Nog
  maar 3 st. ... op voorraad", bij de regel in het formulier.
- **Op locatie.** Op de opdrachtpagina in het monteursportaal legt de monteur de materialen vast
  die hij heeft gebruikt. Die gaan van de voorraad af.

### Waar je het ziet

- Het dashboard heeft een tegel Lage voorraad.
- De pagina van een apparaat toont de onderdelen die op zijn afgeronde opdrachten zijn gebruikt.

### Werkt samen met

Materialen hebben niets nodig. **Conditie** wordt erdoor verrijkt: een materiaal is het artikel van
een onderdeel. Zie [Conditie](/wiki/modules/condition). De
[onderdelenshop](/wiki/modules/parts-shop) heeft materialen nodig, want zijn artikelen zijn
materialen.

<TryIt as="planner" />

<HowItWorks />

Materialen hoorde bij de kern voordat het een module werd. Dat maakt het het voorbeeld van een
module waarvan de tabellen vroeger van de kern waren: opdrachtregels en het voorraadboek. De
module haakt op drie punten in op de opdracht, allemaal in `server/index.ts`:

- `orders.costs`: de materialen van de opdracht als kostenpost in de prijs.
- `orders.saving`: de regels van de opdracht en de voorraad die volgt uit de status worden ermee
  opgeslagen, in de transactie van de opdracht. Een tekort gooit een `Refused`, die het formulier
  bij de velden toont.
- `condition.articles`: de materialen als artikelen van onderdelen (als conditie aan staat).

Het deel van het opdrachtformulier wordt getypeerd en gevalideerd door een valibot-schema
(`form-parts/orders.form.ts`) dat de generator verzamelt in het veld `modules.materials` van het
formulier, zodat SvelteKit het op de server en in de browser valideert. Het monteursportaal slaat
regels op met dezelfde code (`server/lines.ts`), dus beide doen het op dezelfde manier. De enige
die in het voorraadboek schrijft, is `moveStock()`, en `moveOrderStock()` neemt of geeft terug wat
de regels en de status van een opdracht zeggen dat hij moet vasthouden: het verschil tussen wat hij
volgens het voorraadboek vasthoudt en wat hij nu zou moeten vasthouden. Daarom wordt een opdracht
waarvan de status veranderde terwijl de tenant materialen uit had staan, rechtgezet de volgende
keer dat hij wordt opgeslagen. Voor modules die materialen nodig hebben (de onderdelenshop) biedt
`api/stock.server.ts` `reserveStock()` en `releaseStock()` om voorraad apart te zetten binnen de
transactie van de aanroeper.

- <SourceLink path="src/modules/materials/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/materials">de map van de module</SourceLink>.
- <SourceLink path="src/modules/materials/model.ts" line={63}>holdsStock()</SourceLink>: welke statussen
  voorraad vasthouden.
- <SourceLink path="src/modules/materials/server/stock.ts" line={179}>moveOrderStock()</SourceLink>:
  het voorraadboek volgt de opdracht.
- <SourceLink path="src/modules/materials/form-parts/orders.form.ts">orders.form.ts</SourceLink>: het
  deel van het formulier.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
