---
title: Rapportage per vestiging
summary: Een onderhoudsrapportage per vestiging om af te drukken, voor een periode, met de conditie, keuringen, het onderhoud en de storingen van de apparaten, op kantoor en in het klantportaal.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een facilitair manager wil één document per pand: hoe de apparaten ervoor staan, wat er gekeurd
en onderhouden is, welke storingen er waren en hoe snel ze opgelost werden. De
**onderhoudsrapportage** van een vestiging geeft dat voor een periode, op A4, klaar om af te drukken
of als pdf op te slaan.

## Wat erin staat

- **De kop**: de vestiging en haar adres, de klant, de periode en wanneer de rapportage gemaakt is.
- **De samenvatting**, per onderdeel: de apparaten per conditie op de schaal van NEN 2767 en per
  status; de keuringen uitgevoerd, geldig, binnenkort, verlopen en afgekeurd; het onderhoud
  uitgevoerd, binnenkort en achterstallig; de storingen gemeld en opgelost, de gemiddelde oplostijd
  en de afgeronde opdrachten; de energie die de deuren verloren.
- **De apparaten**, elk met zijn conditiescore en de naam daarvan, de laatste en volgende keuring,
  het laatste en volgende onderhoud, en zijn storingen in de periode. Een datum in rood is
  verstreken, in oranje binnenkort.
- **De storingen en opdrachten** van de periode: erin aangemaakt, ingepland of afgerond, de nieuwste
  eerst.

Een onderdeel hoort bij zijn module: zonder de conditiemodule geen conditie, zonder energie geen
energie, en de rapportage werkt met alle modules uit.

## De periode kiezen en afdrukken

De rapportage beslaat deze maand tot nu toe, van de 1e tot vandaag. **Van** en **Tot en met**
kiezen een andere periode van hoogstens een jaar; de keuze staat in het adres
(`?from=2026-01-01&to=2026-03-31`), zodat je haar kunt bewaren of doorsturen. **Afdrukken** drukt
alleen de rapportage af, zonder de app eromheen.

Je komt er vanaf de kaart van elke vestiging op [Alle vestigingen](/wiki/domains/sites-overview) en
vanaf de pagina van de vestiging: op kantoor onder de vestigingen van de klant, in het klantportaal
onder Alle vestigingen. Een klantcontact krijgt alleen de rapportages van de vestigingen die hij
ziet.

<TryIt as="customer" /> <TryIt as="planner" />

<HowItWorks />

**Gebouwd uit de cijfers van de vestigingen.** De rapportage vraagt hetzelfde uitbreidingspunt als
het overzicht, `customers.siteSummary`, voor één vestiging en de gekozen periode, met `units` aan:
elke module geeft dan ook haar kolommen van de tabel met apparaten, een cel per apparaat
(`UnitColumn`). De samenvatting groepeert de cijfers per onderdeel, op de plaatsen van de modules.
De kern voegt zijn eigen onderdeel toe, de kolom met storingen en de lijst met opdrachten, en leest
de apparaten zoals het publiek van de omgeving ze ziet (`readUnits()`), zodat kantoor en portaal één
component en één serverfunctie delen (`siteReport()`).

**De periode** bestaat uit de dagen van de kijker (`periodOf()`): van het begin van de eerste dag
tot het einde van de laatste in zijn tijdzone, geweigerd als ze eindigt voor ze begint of langer is
dan 366 dagen. Energie telt de eigen dagen van het gebouw, zoals haar eigen rapport doet.

**Afdrukken** zet de rapportage op een `<PrintSheet>`, een A4-vel met eigen marges; de omgevingen
houden hun navigatie van het papier, en het formulier van de periode en de knoppen verdwijnen bij
het afdrukken.

- <SourceLink path="src/lib/customers/server/site-report.ts" line={91}><code>siteReport()</code></SourceLink>
- <SourceLink path="src/lib/customers/server/site-summary.ts" line={58}><code>periodOf()</code></SourceLink>
- <SourceLink path="src/modules/checklists/server/site-summary.ts" line={40}><code>checklistSiteSummary()</code></SourceLink>
- <SourceLink path="src/modules/maintenance/server/site-summary.ts" line={41}><code>maintenanceSiteSummary()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
