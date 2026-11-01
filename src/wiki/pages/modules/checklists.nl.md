---
title: Werkbonnen
summary: Een vaste checklist per apparaat bij inspectie- en onderhoudsopdrachten, ingevuld in het monteursportaal, met de keuringsstatus die eruit volgt.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Werkbonnen (in de code de module `checklists`, naar de digitale checkpoint-werkbon) geeft elk
apparaat op een inspectie- of onderhoudsopdracht een checklist: de punten die een monteur
controleert, gemaakt uit een sjabloon voor de apparatuurcategorie van het apparaat. Het menu-item
staat in de zijbalk direct na Apparatuur.

## Wat de module toevoegt

- **Sjablonen.** Een manager maakt een sjabloon per norm: een naam, de norm waarnaar het keurt
  (bijvoorbeeld NEN-EN 12604/12453), hoeveel maanden een keuring ermee geldig blijft, de
  apparatuurcategorieën waarvoor het is (een categorie heeft één sjabloon) en de punten, in groepen
  zoals Mechanisch en Veiligheid. Een sjabloon dat je buiten gebruik stelt, blijft bewaard voor de
  checklists die er al mee gemaakt zijn.
- **De pagina Werkbonnen.** De hoofdpagina van de module toont de apparaten waarvan de categorie een
  sjabloon heeft, met een badge per jaar (open of afgerond). Kies een apparaat om de checklist van
  dit jaar en de historie te zien, of start de keuring of het onderhoud van dit jaar. Starten maakt
  een opdracht, met de status Nieuw en nog niet ingepland, en de checklist komt erbij. Kantoor kan
  de checklist ook invullen voor een monteur, bijvoorbeeld van een papieren formulier dat is
  teruggebracht.
- **Invullen.** Op een inspectie- of onderhoudsopdracht heeft elk apparaat een eigen checklist. De
  monteur zet in het monteursportaal elk punt op Goed, Afkeur of N.v.t., en elk antwoord wordt
  meteen opgeslagen. Een afgekeurd punt vraagt om een opmerking: wat er mis is, of welk onderdeel
  nodig is. Een checklist is afgerond zodra elk punt beantwoord is, met een algemene opmerking en
  advies aan de klant.
- **Regels voor de opdracht.** Een opdracht kan niet worden afgerond zolang een van de checklists
  open staat. Zodra een checklist is ingevuld, kan het apparaat niet meer van de opdracht af, kan de
  opdracht niet van soort veranderen en niet worden verwijderd.
- **Keuringsstatus.** Op basis van de laatste afgeronde checklist is een apparaat **Geldig**,
  **Bijna verlopen** (de laatste 30 dagen van de geldigheid), **Verlopen**, **Afgekeurd** of heeft
  het **Geen keuring**. De status staat als kolom in de apparatenlijst, en op de pagina van het
  apparaat, met de datum tot wanneer hij geldig is.
- **De werkbon op papier.** De checklists van een opdracht worden afgedrukt als werkbon, met de
  handtekeningen van de monteur en de klant.

### Waar je het ziet

- De pagina van de opdracht, de pagina van het apparaat en de opdrachtpagina in het monteursportaal
  tonen de checklists.
- Klanten zien in hun portaal wat de monteur bij elk apparaat heeft gevonden: bij de opdracht, bij
  het apparaat, en als werkbon om af te drukken.
- De bel van kantoor gaat als een checklist wordt afgerond met afgekeurde punten.

### Werkt samen met

- **Onderdelenbeheer** (verrijkt): de keuringsstatus wordt deel van de conditiestatus van een
  apparaat, en een afgeronde checklist geeft het apparaat en zijn onderdelen hun score. Zie
  [Onderdelenbeheer](/wiki/modules/condition).
- **Onderdelen Shop** (verrijkt): een afgekeurd punt stelt het onderdeel voor dat het oplost, met
  een knop "Toevoegen aan opdracht". Zie [Onderdelen Shop](/wiki/modules/parts-shop).

Werkbonnen heeft niets nodig, en werkt zonder beide.

<TryIt as="planner" />

<HowItWorks />

Het manifest, `module.ts`, noemt de soorten opdrachten waarmee de module werkt (`orderTypes:
["inspection", "maintenance"]`), de plek in de zijbalk (`nav: { after: "equipment" }`) en
`enhances: ["condition", "parts-shop"]`. De module haakt in op de kern en op de modules die hij
verrijkt op deze punten, allemaal aangeleverd in `server/index.ts`:

- `orders.units` houdt een checklist per apparaat gelijk met de apparaten en de soort van de
  opdracht: het maakt concepten als er apparaten bij komen, en laat ze alleen vallen zolang er nog
  niets is beantwoord.
- `orders.saving` weigert het afronden zolang een checklist open staat, en weigert verwijderen, een
  andere soort of een apparaat eraf halen zodra er een is vastgelegd.
- `condition.signals` geeft Onderdelenbeheer de keuringsstatus, als SQL over `equipment`, en
  `condition.checkpoints` geeft de sjabloonpunten waarmee een onderdeel gecontroleerd kan worden.
  Met de Onderdelen Shop aan koppelt `parts-shop.checkpoints` de artikelen aan de punten.
- `notifications.rules` laat de bel gaan bij afgekeurde punten, en `access.rules` zegt wie de
  gegevens mag lezen en wijzigen.

De module declareert ook eigen punten voor de modules die hem verrijken: de slot (een plek in een
pagina die een andere module vult) `checklists.field.checklist` in het monteursportaal
(Onderdelenbeheer stelt daar zijn adviesvraag), de slots voor afgekeurde punten
`checklists.order.rejected` en `checklists.client.rejected` (de voorstellen van de Onderdelen Shop),
en de hook `checklists.completed`, waarop Onderdelenbeheer antwoordt door een conditie vast te
leggen. De kolommen komen in de apparatenlijst en in de apparatenlijst van Onderdelenbeheer.

De monteur en kantoor vullen een checklist in met dezelfde code: een `Filler` van de soort
`engineer` of `office` (monteurs alleen hun eigen opdrachten terwijl die in behandeling zijn,
kantoor elke open opdracht). Elke wijziging wordt in een transactie opgeslagen. De keuringsstatus
is één functie in `model.ts` en dezelfde regel in SQL voor de kolom in de lijst, die geen
parameters bindt omdat Onderdelenbeheer hem vaak herhaalt in één statement.

- <SourceLink path="src/modules/checklists/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/checklists">de map van de module</SourceLink>.
- <SourceLink path="src/modules/checklists/server/checklists.ts" line={202}>syncChecklists()</SourceLink>:
  de checklists die de apparaten van een opdracht volgen.
- <SourceLink path="src/modules/checklists/server/field.ts" line={45}>Filler</SourceLink>: één set
  regels voor de monteur en kantoor.
- <SourceLink path="src/modules/checklists/model.ts" line={239}>inspectionStatus()</SourceLink>: geldig,
  bijna verlopen, verlopen, afgekeurd, geen.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
