---
title: Alle vestigingen
summary: Alle vestigingen van een klant in één beeld, live, de slechtste bovenaan, zoals een hoofdkantoor ze in het klantportaal volgt en het kantoor ze op de pagina van de klant ziet.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een klant met veel vestigingen wil ze allemaal vanaf het hoofdkantoor volgen: waar staat een
storing open, is er een monteur onderweg, welke apparaten zijn kritiek. **Alle vestigingen** toont
een kaart per vestiging, die met aandacht nodig bovenaan, en verandert zodra er iets gebeurt.

## Wat de kaart van een vestiging toont

De naam en het adres, hoeveel apparaten er staan, of de vestiging aandacht nodig heeft of alles in
orde is, en chips voor wat gezien moet worden, elk met een aantal:

- **Open storingen**: meldingen die nog niet geaccepteerd zijn, en storingen die nog gedaan moeten
  worden;
- **Monteur onderweg** en **Vandaag gepland**;
- met de conditiemodule de apparaten die **Kritiek** zijn of **Aandacht** nodig hebben;
- met checklists de keuringen die **verlopen** zijn of binnen 30 dagen verlopen;
- met energie de energie die de deuren **vandaag verloren**.

Een rode of oranje chip maakt de vestiging er een met aandacht nodig, met een balk langs de kaart.
De vestigingen met het meeste rood komen eerst, dan die met het meeste oranje, dan de rest op naam.
**Aandacht nodig** boven de kaarten toont alleen die; de keuze blijft in het adres, zodat terug en
herladen haar houden.

Wie op een kaart tikt, komt op de pagina van de vestiging: haar chips, haar openstaand werk en haar
apparaten. Elke kaart en elke vestigingspagina linkt naar de
[onderhoudsrapportage](/wiki/domains/site-report) van de vestiging.

## Waar het staat

- **In het klantportaal** opent een rij op Start, **Alle vestigingen**, `/portal/sites`: één kolom,
  gemaakt voor de telefoon. Een klantcontact ziet de vestigingen van zijn eigen klant, en als het
  kantoor hem voor een paar vestigingen uitnodigde, alleen die.
- **Op kantoor** opent **Alle vestigingen, live** op de pagina van de klant
  `/customers/<code>/sites`: dezelfde kaarten, zodat een planner de vestigingen van een klant ziet
  zoals het hoofdkantoor ze ziet.

Beide pagina's blijven live: een storing gemeld in het portaal, een ingeplande opdracht, een
vastgelegde conditie of een energie-alert verschijnt op de kaart zonder herladen.

<TryIt as="customer" /> <TryIt as="planner" />

<HowItWorks />

**Eén collector, elke module.** De cijfers komen uit één uitbreidingspunt,
`customers.siteSummary`: de kern vraagt het met de vestigingen die de kijker mag lezen en een
periode, en elke module die aan staat geeft haar cijfers per vestiging, met de soorten records
waaruit ze gelezen zijn. De kern voegt zijn eigen toe (storingen, onderweg, vandaag gepland,
afgerond werk) en sorteert de vestigingen (`worstFirst()`). Een module die uit staat voegt niets
toe, en een die faalt wordt weggelaten.

**Wat de kijker mag lezen.** De kern kiest de vestigingen met het toegangsregister
(`visible("site")`), en elke module beperkt haar eigen gegevens op dezelfde manier: de apparaten
(`visible("equipment")`), de opdrachten, de checklists, de onderhoudsplannen van een apparaat (een
klantcontact leest die van zijn eigen apparaten), de energielocaties. Zo ziet een klantcontact dat
tot een paar vestigingen beperkt is niets van de andere, en zijn de energie-alerts, die van het
kantoor zijn, geen chip voor een klantcontact.

**Live.** Elke pagina ververst als de feed van zijn omgeving een wijziging meldt van de soorten
waaruit de cijfers gelezen zijn (`refreshOnActivity()` met de `watches` van het antwoord). De feed
van het portaal volgt elke gelogde soort, en meldt een klantcontact alleen wat hij mag lezen.

- <SourceLink path="src/lib/customers/extensions.ts" line={117}><code>siteSummary</code></SourceLink>
- <SourceLink path="src/lib/customers/server/site-summary.ts" line={253}><code>summarizeSites()</code></SourceLink>
  en <SourceLink path="src/lib/customers/server/site-summary.ts" line={289}><code>siteOverview()</code></SourceLink>
- <SourceLink path="src/lib/customers/sites/figures.ts" line={57}><code>worstFirst()</code></SourceLink>
- <SourceLink path="src/modules/condition/server/site-summary.ts" line={39}><code>conditionSiteSummary()</code></SourceLink>
- <SourceLink path="src/modules/energy/server/site-summary.ts" line={23}><code>energySiteSummary()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
