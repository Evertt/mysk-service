---
title: Extension points
summary: Hoe een optionele module iets toevoegt aan pagina's en logica van de kern zonder dat de kern weet dat hij bestaat, via slots, hooks en gegenereerde registers.
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

Zet een bedrijf de module **Materialen** aan, dan krijgen zijn opdrachten materiaalposten in het
opdrachtformulier, telt de prijs ze mee, volgt de voorraad de status van de opdracht, toont de
pagina van een apparaat zijn onderdelen, en krijgt het dashboard een tegel voor lage voorraad. Zet
hem uit en dat is allemaal weg, alsof de app het nooit had. De kern van de app, het deel dat elk
bedrijf heeft (opdrachten, klanten, apparatuur, monteurs), doet hier zelf niets van en noemt
materialen nergens.

Dat werkt via **extension points**: plekken waar de kern zegt "alles wat aanstaat, mag hier iets
toevoegen". Een module plugt in, nooit andersom. De punten zijn er in een paar soorten:

| Soort               | De module voegt toe…                                        | Voorbeeld                                              |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Slot**            | een kaart of tegel op een pagina van de kern                | `orders.detail.side`, `dashboard.cards`                |
| **Formulierslot**   | velden in een formulier van de kern, mee gevalideerd        | `orders.form` van het opdrachtformulier                |
| **Bulkactie**       | een actie op de geselecteerde rijen van een lijst           | `orders.list.bulk`                                     |
| **Lijstkolom**      | een kolom in een lijst die de server bouwt                  | `equipment.list.columns`                               |
| **Collector**       | zijn deel van een antwoord, zoals een kostenpost            | `orders.costs`, `notifications.rules`, `access.rules`  |
| **Event**           | een reactie nadat een wijziging is gecommit                 | `orders.committed`                                     |
| **Vote**            | een weigering, als hij iets moet tegenhouden                | `customers.removingSite`                               |
| **Save hook**       | zijn deel van het opslaan, in de transactie van de eigenaar | `orders.saving`, `orders.units`                        |
| **Dagelijkse taak** | werk om één keer per dag te doen, als het systeem           | de plannen van Onderhoudsplannen die opdrachten worden |

Een pagina die toont wat een slot bijdraagt, zet elk deel in een eigen boundary (een vangnet voor
fouten). Faalt de kaart van een module, dan toont die kaart een melding en gaat de rest van de
pagina gewoon door.

<Diagram viewBox="0 0 440 170" label="Een pagina van de kern biedt een slot aan. Modules die aanstaan, zoals Materialen en Onderdelenbeheer, dragen eraan bij. Een module die uitstaat niet.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="10" width="150" height="150" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="79" y="30" font-weight="600" fill="var(--foreground)">Pagina van de kern</text>
		<text x="79" y="48" fill="var(--muted-foreground)">een apparaatpagina</text>
		<rect x="8" y="62" width="142" height="34" rx="6" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="4 3" />
		<text x="79" y="83" fill="var(--foreground)">equipment.detail.side</text>
		<rect x="262" y="10" width="174" height="40" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="349" y="35" fill="var(--foreground)">Materialen: aan</text>
		<rect x="262" y="65" width="174" height="40" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="349" y="90" fill="var(--foreground)">Onderdelenbeheer: aan</text>
		<rect x="262" y="120" width="174" height="40" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3" />
		<text x="349" y="145" fill="var(--muted-foreground)">Docks: uit, niets erbij</text>
		<path d="M 260 30 C 210 30 190 79 152 79 M 260 85 C 220 85 190 79 152 79" fill="none" stroke="var(--primary)" stroke-width="1.5" />
	</g>
</Diagram>

<HowItWorks />

**Een module is een map.** Alles van een optionele module staat in `src/modules/<id>/`, en de kern
importeert er nooit uit. De tabellen van een module verwijzen naar tabellen van de kern, nooit
andersom. Omdat de module de pagina's van de kern niet importeert en de kern de module niet, moet
de verbinding op een andere manier gevonden worden: een generator.

**De generator** (`scripts/modules.ts`, gedraaid door `pnpm generate` en als Vite laadt) leest de
modulemappen en schrijft de registers die de kern wel importeert: de manifesten, de hooks, de
bijdragen aan de slots, de formulierdelen en de lijstkolommen (`*.gen.ts`, in gitignore). Een
module draagt bij door een bestand te zetten in een map met de naam van het punt:
`slots/orders.detail.side/…`, `columns/equipment.list.columns.ts`, `form-parts/orders.form.ts`. Zie <SourceLink path="src/lib/extensions/define.ts" line={167}>defineSlot</SourceLink> voor hoe een punt
wordt gedeclareerd.

**Punten worden gedeclareerd door hun eigenaar.** De kern declareert zijn punten in
`src/lib/<domain>/extensions.ts` (`orders.costs`, `orders.saving`, `customers.removingSite`), en
een module declareert zijn eigen voor andere modules (`invoices.billableItems`). De slots,
lijstkolommen en bulkacties van een record zijn één aanroep, `defineRecordPoints("orders", { … })`.

**Punten op de server** gaan via een kernel (het deel dat de modules aanroept). Een module draagt
bij in zijn `server/index.ts`:

```ts
export default defineServerModule("materials", [
	contribute(costs, materialCosts),
	contribute(saving, saveOrderMaterials),
]);
```

en de eigenaar roept de kernel aan voor de modules die aanstaan, in de volgorde van hun
afhankelijkheden: `collect()` voor collectors, `emit()` voor events na de commit, `vote()` voor
votes (elke weigering wint), `save()` voor save hooks (de eerste problemen houden de rest tegen, en
de eigenaar draait terug). Een module die uitstaat, wordt nooit iets gevraagd. Zie <SourceLink path="src/lib/server/extensions.ts" line={80}>contribute</SourceLink> en <SourceLink path="src/lib/server/extensions.ts" line={115}>defineServerModule</SourceLink>.

**Afhankelijkheden** zijn `requires` en `enhances` in het manifest van een module. Een module
waarvan een vereiste module uitstaat, staat overal uit, en de instellingenpagina zet modules aan en
uit samen met wat ze nodig hebben en wat hen nodig heeft.

Pagina's die een punt tonen, laden de bijdragen met `loadContributions()` (nooit door het
gegenereerde bestand met de hand te filteren), en renderen slots in `<ExtensionSlot>`, dat de
error boundary is. Een guard spec (een test die de broncode leest) weigert de handgeschreven
varianten.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
