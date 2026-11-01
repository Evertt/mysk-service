---
title: Partnerprogramma
summary: Een jaarlijkse bonus voor geaccepteerde partnerklanten, uit hun betaalde omzet, uitgekeerd als cash of als Parts Credit in een wallet.
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Het partnerprogramma beloont klanten die veel bij je afnemen. Een klant die je als **partner**
accepteert, verdient een level met de omzet die hij in een jaar binnenbrengt, en daarover een bonus
die wordt uitgekeerd als het jaar is afgesloten: als Cash Bonus of als een hoger bedrag aan Parts
Credit. In de app heet het **Partnerprogramma**; bij SHLTR is het de Partner Bonus met de wallet.

## Wat de module toevoegt

- **Partners.** Op de pagina van een klant kiest een manager **Accepteren als partner**. De
  partnerlijst toont van elke partner de omzet tot nu toe dit jaar, het level en wat er in de
  wallet zit.
- **Programmajaren.** Een manager stelt elk jaar in: de **levels** (een naam, de omzetdrempel en de
  percentages van de Cash Bonus en het Parts Credit) en, per omzetcategorie, of die meetelt voor
  het level en voor elke vorm van bonus. De categorieën liggen vast: onderhoudscontracten, service
  en onderhoud, reguliere onderdelen, reguliere opdrachten, projecten met reguliere condities,
  speciale projectprijzen en tenders (netto-netto). Een regel kan Ja, Nee of **Volgens afspraak**
  zeggen. Een nieuw jaar begint als kopie van het vorige. Het level is het hoogste waarvan de
  partner de drempel met zijn omzet haalt.
- **Opdrachten indelen.** Voor categorieën die "volgens afspraak" meetellen, heeft het
  opdrachtformulier een classificatie, die zegt hoe de omzet van deze opdracht meetelt voor het
  level en de bonus van de partner.
- **Een jaar afsluiten.** Na 31 december sluit een manager het jaar af. Dan liggen de cijfers, het
  level en de bonus in beide vormen van elke partner vast. De partner kiest daarna **cash** of
  **Parts Credit**, één keer, en voorgoed. Een manager kan de keuze ook op kantoor maken.
  - Credit gaat als toekenning in de **wallet** van de partner, geldig tot het einde van een later
    jaar.
  - Cash is een bedrag om uit te betalen, als losse creditnota in Facturatie, of buiten de
    app.
- **De wallet.** Een grootboek met boekingen: Toegekend, Besteed, Teruggeboekt, Vervallen en
  Correctie. Kantoor kan met de hand een boeking toevoegen, voor credit dat buiten de shop is
  besteed of credit dat erbij komt. Credit waarvan de datum voorbij is, vervalt vanzelf, in de
  dagelijkse taak.

### Waar je het ziet

- Een partner ziet zijn eigen level, bonus en wallet in het klantportaal, en kiest daar zijn bonus
  als het jaar is afgesloten.
- De pagina van een klant heeft een kaart Partner Bonus, en het dashboard een kaart met het jaar
  van het programma.

### Werkt samen met

- **Facturatie** (nodig): de omzet van de partners is hun **betaalde** facturen, min verrekende
  creditnota's. Zonder Facturatie staat het programma uit. Zie [Facturatie](/wiki/modules/invoices).
- [Onderdelen Shop](/wiki/modules/parts-shop) heeft Partnerprogramma nodig: daar wordt het
  credit besteed.

<TryIt as="planner" />

<HowItWorks />

Het partnerprogramma is het voorbeeld van een module die **de gegevens van een andere module leest
via diens `api/`**. Het leest nooit de tabellen van Facturatie: het vraagt `api/revenue.server.ts`
om de regels van de betaalde facturen, min die van de verrekende creditnota's, ook als subquery
voor zijn eigen lijst op de server, en betaalt een Cash Bonus uit via
`api/credit-notes.server.ts`, binnen de eigen transactie van het programma. Het verwijst naar de
tabel van Facturatie met een foreign key, wat mag omdat het die module nodig heeft.

De regels zijn pure functies in `model.ts`, gedeeld door de tabellen, de seed (de demogegevens), de
server en de UI: de omzet van een partner bepaalt zijn level, en het deel ervan dat meetelt, maal
het percentage van het level, is zijn bonus. Bedragen zijn in centen en percentages in basispunten.
Als een jaar wordt afgesloten, worden de cijfers **vastgezet** (`partner_bonus_year`), zodat een
latere wijziging van de regels de geschiedenis niet herschrijft. De wallet is een grootboek waarvan
het saldo de som van de boekingen is; elke boeking houdt bij wat er nog over is van het credit dat
ze binnenbracht, zodat SQL kan optellen wat er op een bepaalde dag beschikbaar is.

Het haakt in op `orders.saving` (de classificatie wordt vanuit het opdrachtformulier met de
opdracht opgeslagen, als `modules.partnerProgramme`: de sleutel van een id met een streepje is in
camel case) en `jobs.daily` (credit laten vervallen), en de ingang in het klantportaal is de
`portal` van het manifest. Het declareert het slot `partner-programme.client.wallet` (een plek in de
pagina die een andere module vult), waar Onderdelen Shop een link naar de shop neerzet.

- <SourceLink path="src/modules/partner-programme/module.ts">module.ts</SourceLink>: het manifest, en <SourceLink path="src/modules/partner-programme">de map van de module</SourceLink>.
- <SourceLink path="src/modules/partner-programme/model.ts" line={267}>levelFor()</SourceLink>: het
  level bij een omzet.
- <SourceLink path="src/modules/partner-programme/server/close.ts" line={84}>closeYear()</SourceLink>:
  een jaar vastzetten.
- <SourceLink path="src/modules/partner-programme/server/wallet.ts">wallet.ts</SourceLink>: het
  grootboek.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
