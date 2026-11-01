---
title: Facturen
summary: Facturen en creditnota's voor afgeronde opdrachten en de vergoedingen van andere modules, met btw, pdf's en openstaande posten op het dashboard.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Facturen maakt van afgerond werk een rekening. In de app heet de module **Facturatie**. Het is de
module waarop andere bouwen: het partnerprogramma heeft hem nodig, en contracten bieden hem hun
vergoedingen aan.

## Wat de module toevoegt

- **Facturen.** Een conceptfactuur wordt voor een klant gemaakt uit wat er te factureren is: de
  afgeronde opdrachten die nog niet gefactureerd zijn, geprijsd precies zoals op hun pagina
  (arbeid, de kosten die andere modules toevoegen, en correcties zoals wat een servicecontract
  inbegrijpt), en vergoedingen die andere modules aanbieden, zoals het maandbedrag van een
  contract. Je kunt eigen regels toevoegen, zoals reiskosten.
- **Een status die je kunt volgen.** Een concept wordt **verstuurd**: het krijgt de datum van
  vandaag, kan niet meer worden gewijzigd, en de opdrachten erop worden Gefactureerd. Daarna is het
  **Verzonden**, wordt het **Achterstallig** op de dag na de vervaldatum (berekend, niet
  opgeslagen), en is het **Betaald** als je de betaling vastlegt. Een conceptfactuur of verzonden
  factuur kun je **annuleren**: hij houdt zijn nummer maar factureert niets, en de opdrachten gaan
  terug naar Afgerond, zodat ze op een andere factuur kunnen. Nummers lopen per organisatie op,
  zoals `INV-2026-00001`, zonder gaten.
- **Creditnota's.** Crediteer een deel van een factuur of de hele factuur: kies hele regels of een
  deel van een regel. Een verstuurde creditnota gaat af van wat er op de factuur nog te betalen
  is, en is er niets meer over, dan is de factuur betaald met zijn creditnota's. Een creditnota die
  geld terugbetaalt, is verrekend zodra het geld is terugbetaald.
- **Pdf's.** Download een factuur of een creditnota als pdf.
- **Instellingen.** Een manager stelt het btw-tarief in (dat op een factuur vastligt zodra die
  wordt verstuurd), de standaard betalingstermijn, en de dag vanaf wanneer de vergoedingen van
  andere modules worden gefactureerd.

### Waar je het ziet

- Selecteer in de opdrachtenlijst afgeronde opdrachten van één klant en kies **Factuur maken**: een
  concept voor die klant met die opdrachten, dat daarna opengaat.
- De pagina van een opdracht heeft een factuurkaart. In de factuurlijst kun je meerdere verzonden
  facturen in één keer als betaald markeren.
- Het dashboard toont wat klanten nog moeten betalen (verzonden facturen min hun creditnota's,
  inclusief btw) en de achterstallige facturen, de oudste eerst.

### Werkt samen met

Facturen heeft niets nodig en verrijkt niets. **Contracten** bieden hun maandbedragen aan (zie
[Contracten](/wiki/modules/contracts)), en het **partnerprogramma** heeft facturen nodig voor zijn
cijfers en betaalt een Cash Bonus uit als creditnota (zie
[Partnerprogramma](/wiki/modules/partner-programme)).

<TryIt as="planner" />

<HowItWorks />

De regels van een factuur staan op één plek, `invoice.ts`: de nummering, de status, totalen in
centen (de btw is het subtotaal maal het tarief, afgerond met half van nul af) en hoe een opdracht
regels wordt. Een opdracht wordt een regel tegen zijn prijs vóór correcties, gevolgd door een regel
per correctie van de modules van de tenant, zodat de regels optellen tot het totaal van de
opdracht uit `priceOrders()`. De server past de regels toe in `server/`; creditnota's delen de
factuurcode in `documents.ts`, naar `kind`.

Wat er te factureren is, komt van twee plekken. Afgeronde opdrachten worden uit de kern gelezen. De
vergoedingen van andere modules komen via de collector (een verzamelpunt waar modules op
antwoorden) `invoices.billableItems`, gedeclareerd in `api/extensions.ts`, met `onError: "fail"`:
als een module niet kan antwoorden, mislukt het request, in plaats van dat er een factuur zonder
zijn vergoeding komt. Iets is gefactureerd zolang het op een factuur staat die niet geannuleerd is.

Twee bijdragen gaan de module uit: de bulkactie `invoices:create-invoice` op de opdrachtenlijst
(`orders.list.bulk`, die alleen afgeronde opdrachten van één klant aanneemt, en op de server
controleert of er al een op een factuur staat), en de slots `orders.detail.side` en
`dashboard.cards` (plekken in een pagina die een module vult). De hook `orders.committed` laat een
opdracht die de kern net heeft opgeslagen zijn factuurkaart verversen. Voor modules die facturen
nodig hebben is er een map `api/`, bijvoorbeeld `revenue.server.ts` (de regels van de betaalde
facturen min die van de verrekende creditnota's) en `credit-notes.server.ts` (een losse
creditnota), zodat ze de tabellen van facturen nooit rechtstreeks lezen.

- <SourceLink path="src/modules/invoices/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/invoices">de map van de module</SourceLink>.
- <SourceLink path="src/modules/invoices/invoice.ts">invoice.ts</SourceLink>: nummers, status, totalen,
  regels.
- <SourceLink path="src/modules/invoices/server/billable.ts">billable.ts</SourceLink>: waarvoor een
  klant gefactureerd kan worden.
- <SourceLink path="src/modules/invoices/server/invoices.ts" line={271}>issueInvoice()</SourceLink>:
  versturen.
- <SourceLink path="src/modules/invoices/bulk-actions/orders.list.bulk.ts">orders.list.bulk.ts</SourceLink>:
  de bulkactie.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
