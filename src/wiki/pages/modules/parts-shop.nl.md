---
title: Onderdelen Shop
summary: Partners bestellen vervangingsonderdelen in het klantportaal en betalen met hun Parts Credit; het kantoor bevestigt, verzendt en levert.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Onderdelen Shop is een catalogus in het klantportaal waar een partner vervangingsonderdelen
bestelt, bijvoorbeeld voor sectionaaldeuren en levellers, en betaalt met het **Parts Credit** uit
zijn wallet. In de code heet de module `parts-shop`; het menu-item staat in de zijbalk na
Materialen.

## Wat de module toevoegt

- **Shopartikelen.** Een artikel is een materiaal dat in de shop wordt aangeboden: je geeft het een
  categorie en een omschrijving, en zegt of het **te betalen is met Parts Credit**, of **op
  aanvraag** is (te zien, maar met de prijs op aanvraag en niet te bestellen in de shop), en welke
  checklistpunten het oplost. De prijs en de voorraad zijn die van het materiaal. Alleen eigenaren
  en beheerders wijzigen de categorieën van de shop.
- **De shop in het portaal.** Een partner zoekt in de catalogus op naam of artikelnummer, filtert op
  categorie, en vult een winkelwagen. De voorraad staat als Op voorraad, Lage voorraad of Op
  aanvraag.
- **Afrekenen met Parts Credit.** Alleen Parts Credit wordt aangenomen: geen gemengde betaling, geen
  factuur. Bij het afrekenen zie je het beschikbare saldo, de bestelling en het saldo erna. Over een
  bestelling die met Parts Credit is betaald, wordt geen btw gerekend. De bestelling wordt geweigerd
  als het credit of de voorraad niet genoeg is, of als het bedrijf niet in het partnerprogramma zit.
- **Shopbestellingen.** Het kantoor ziet de shopbestellingen en brengt elke bestelling door
  **Bevestigen**, **Verzenden** en **Geleverd melden**. De status is Geplaatst, Bevestigd,
  Verzonden, Geleverd of Geannuleerd. Een shopbestelling kan worden geannuleerd zolang hij niet is verzonden: het credit
  gaat terug in de wallet van de partner (credit dat intussen is vervallen, blijft vervallen) en de
  onderdelen gaan terug in de voorraad.
- **Voorgestelde onderdelen.** Als bij een keuring een punt wordt afgekeurd, toont de opdracht het
  **Benodigd onderdeel**: de artikelen die dat punt oplossen, met een knop "Toevoegen aan
  opdracht". De klant ziet hetzelfde voorstel in zijn portaal, uit de shop.

### Waar je het ziet

- Het dashboard heeft een tegel met de open shopbestellingen.
- De bel van kantoor gaat als een klant een bestelling plaatst.
- De wallet van het partnerprogramma in het portaal verwijst naar de shop.

### Werkt samen met

- **Materialen** en **Partnerprogramma** (nodig): artikelen zijn materialen met hun voorraad,
  en het credit komt uit de wallet. Zet je een van beide uit, dan gaat de shop ook uit. Zie
  [Materialen](/wiki/modules/materials) en [Partnerprogramma](/wiki/modules/partner-programme).
- **Werkbonnen** (verrijkt): de voorstellen bij afgekeurde punten. Zie
  [Werkbonnen](/wiki/modules/checklists).
- **Onderdelenbeheer** (verrijkt): de punten die een artikel oplost, zijn de punten waarmee een
  onderdeel met dat artikel wordt gecontroleerd. Zie [Onderdelenbeheer](/wiki/modules/condition).

<TryIt as="customer" />

<HowItWorks />

Een bestelling plaatsen is één transactie, in `placeShopOrder()`: die besteedt het Parts Credit met
`spendCredit()` van Partnerprogramma en zet de voorraad apart met `reserveStock()` van
Materialen, allebei gecontroleerd binnen die transactie, zodat het saldo nooit onder nul komt en
de voorraad niet twee keer kan opraken. Annuleren doet het omgekeerde, `giveBackCredit()`
en `releaseStock()`. De shop leest de tabellen van die modules alleen via hun mappen `api/`. Elke
wijziging wordt gelogd bij de klant.

De pagina's van de shop in het portaal zijn de ingang `portal` van het manifest en de routes in de
groep `(customer)` (`/parts-shop/portal`). De queries gebruiken de set van de module voor klanten,
waarvan de handlers alles beperken met `currentCustomer()`, zodat een klant alleen zijn eigen
bestellingen kan zien.

De bijdragen aan extension points (plekken waar de kern en andere modules ruimte laten) zijn klein:
`parts-shop.checkpoints` is een collector (een verzamelpunt waar modules op antwoorden) die de shop
declareert in `api/extensions.ts`, waarop Werkbonnen antwoordt met de sjabloonpunten waaraan de
artikelen gekoppeld kunnen worden; de shop antwoordt op `condition.articleCheckpoints` (als
Onderdelenbeheer aan staat) en `notifications.rules` (de bel voor een bestelling die een klant
plaatst). De slots (plekken in een pagina die een module vult) voor voorstellen,
`checklists.order.rejected` en `checklists.client.rejected`, zijn punten van Werkbonnen, gevuld
vanuit de `slots/` van de shop.

- <SourceLink path="src/modules/parts-shop/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/parts-shop">de map van de module</SourceLink>.
- <SourceLink path="src/modules/parts-shop/server/orders.ts" line={89}>placeShopOrder()</SourceLink>:
  credit en voorraad in één transactie.
- <SourceLink path="src/modules/parts-shop/api/extensions.ts">api/extensions.ts</SourceLink>: de
  punten die de shop declareert.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
