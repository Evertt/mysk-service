---
title: Het werkverslag
summary: Wat er op de locatie van een opdracht is gedaan, op één plek gelezen, en voor elke doelgroep alleen wat die mag zien.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Als het werk klaar is, houdt de opdracht er een **werkverslag** van bij:

- de **apparaten** waaraan gewerkt is, in de volgorde waarin dat gebeurde, elk met zijn categorie
  en waar het staat (de vestiging en de locatie);
- de **notities** die de monteur onderweg schreef ("poortcode gewijzigd", "volgende keer een nieuwe
  motor nodig");
- de **aftekening**: wie voor de klant tekende, de handtekening van de monteur zelf, en wanneer.

Vier schermen tonen het, en geen twee precies hetzelfde:

- **De opdrachtpagina van kantoor** toont de notities, en wie op kantoor de aftekening vastlegde.
  De monteur staat er met zijn volledige naam. De apparaten komen met de contact- en
  toegangsgegevens van de vestigingen, en de garantiedatum.
- **De opdracht van de monteur** toont de notities, maar niet wie de aftekening vastlegde. De
  monteur staat er niet bij: dat is hij zelf. De apparaten komen met de contact- en
  toegangsgegevens van de vestigingen, bij zijn eigen opdracht.
- **De opdracht van de klant** toont geen notities en niet wie de aftekening vastlegde. De monteur
  staat er met zijn voornaam. Bij de apparaten staat alleen het adres van de vestigingen.
- **De afgedrukte werkbon** toont geen notities en niet wie de aftekening vastlegde, en noemt de
  monteur met zijn volledige naam. De apparaten staan erop zoals de klant ze ziet.

Zo leest een klant nooit de notities van een monteur, ziet een monteur niet wie op kantoor de
aftekening vastlegde, en ziet alleen het kantoor de garantiedatum van een apparaat. De afgedrukte
**werkbon** gaat naar de klant, dus hij is geschreven zoals de klant hem ziet, met de monteur bij
zijn volledige naam.

De apparaten staan in elke shell (elke omgeving) op dezelfde manier: een rij per apparaat met zijn
categorie en locatie, met een link naar zijn pagina in die shell, met de naam van de vestiging erbij als
de apparaten van de opdracht op meer dan één vestiging staan.

<TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**Eén lezer.** `readWorkRecord(scope)` in `src/lib/orders/server/work-record.ts` leest het, en
`readWorkRecords()` leest meerdere opdrachten in evenveel statements als één (de opdrachtpagina en
zijn hovercard delen die). Wie het verslag gebruikt, schrijft geen eigen selects van apparaten,
notities of aftekeningen: dat zijn de opdrachtpagina van kantoor (`getOrder`), die van het
monteursportaal (`getMyOrder`), die van het klantportaal (`getPortalOrder`) en de afgedrukte werkbon
van de checklistsmodule (`loadWorkOrder`). Elk leest zijn eigen kopgegevens ernaast, op de `where`
van de scope.

**Wie wat ziet, is één tabel.** `audiences` in hetzelfde bestand is de enige plek die het zegt:
`office`, `engineer`, `customer` en `workOrder`, elk met `notes`, `collectedBy`, `engineer` en
`units`. Een sleutel waar de tabel nee tegen zegt, zit niet in het _type_ van `WorkRecord<A>`. Het
verslag van een klant heeft helemaal geen eigenschap `notes`, dus een pagina kan die niet per
ongeluk tonen. Een nieuwe kolom die een portaal niet mag zien, wordt een sleutel in de tabel, geen
eigen select van een pagina.

**Een scope kiest de opdracht en noemt de doelgroep.** Een scope is het bereik: welke opdracht, voor
wie. Alleen deze functies maken er een, elk async, en ze vragen het access registry (het register
dat zegt wie welke gegevens mag lezen of wijzigen) om de voorwaarde voor de opdracht
(`visibleOrNone("order", …)`), zodat een pagina, een lijst en `mayRead()` het eens zijn:

- `await officeOrder(number)`: de opdracht van de tenant, de organisatie;
- `await engineerWork(ref)`: de eigen opdracht van de monteur;
- `await customerWork(access, number)`: die van de klant, met alleen de apparaten op de vestigingen
  van het klantcontact;
- `await printedWorkOrder(number, viewer)`: voor het kantoor elke opdracht; voor een klantcontact
  alleen afgeronde.

Een opdracht die de scope niet bereikt, leest als `undefined`, en de aanroeper antwoordt met een 404
met een eigen melding.

**De vestigingen** zijn de verschillende vestigingen van de apparaten; bij een opdracht zonder
apparaten de vestiging van de klant als die er maar één heeft, anders geen. De apparaten worden
gelezen zoals hun doelgroep ze ziet, door `readUnits()` (`src/lib/equipment/server/units.ts`); zie
[Apparatuur](/wiki/domains/equipment).

**Tonen** gaat met componenten voor elke shell: `<WorkUnits>`, `<SignOff>` en `<NotesList>`
(`#lib/orders/components.ts`).

- <SourceLink path="src/lib/orders/server/work-record.ts" line={62}><code>audiences</code></SourceLink>
- <SourceLink path="src/lib/orders/server/work-record.ts" line={211}><code>readWorkRecord()</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={118} symbol="orderNote"><code>order_note</code></SourceLink> en <SourceLink path="src/lib/server/db/schema/orders.ts" line={139} symbol="orderSignoff"><code>order_signoff</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="The work record" />
