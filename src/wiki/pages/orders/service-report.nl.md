---
title: Het servicerapport
summary: De getekende werkbon die een klant van een afgeronde klus bewaart. Je kunt hem nu afdrukken; een pdf die wordt gemaild en bewaard, is gepland.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Als een klus klaar is, verwacht de klant iets wat hij kan bewaren: wat er gedaan is, door wie, en
beide handtekeningen. In de branche heet dat de **werkbon**, en zo heet hij hier ook: de werkbon is
tegelijk het servicerapport. De afgedrukte werkbon bestaat. Hem als pdf maken, die pdf bewaren en
naar de klant mailen is nog alleen een plan.

## Wat er is

Bij een opdracht met checklists (ingevuld of niet) heeft de pagina van de opdracht een knop
**Werkbon**. Die opent de werkbon, opgemaakt voor A4, zonder het menu van de app, met een knop
**Afdrukken** die het printvenster van de browser gebruikt (waarmee je ook een pdf kunt bewaren).
Erop staan:

- de opdracht: het nummer, type, status, datum en de monteur;
- de klant, en de vestiging waar het werk was;
- de apparaten, elk met zijn checklist: elk punt met zijn uitkomst, gegroepeerd, en de opmerkingen;
- de handtekeningen van de monteur en de klant, met de namen.

Het kantoor en de klantcontacten kunnen hem allebei openen. Een klantcontact ziet de
versie die voor hem geschreven is: alleen de apparaten op zijn vestigingen, geen notities van de
monteur, en van het kantoorgedeelte van een checklist alleen dat het kantoor het heeft afgerond. Een
klantcontact kan alleen de werkbon van een afgeronde opdracht openen.

Hij hoort bij de module **Werkbonnen** (`checklists`), omdat de checklists het grootste deel van de
pagina zijn. Zonder die module staat de aftekening van een opdracht op zijn pagina, maar is er geen
werkbon om af te drukken.

<TryIt as="planner" /> <TryIt as="customer" />

## Wat er gepland is

Het plan voor de pdf (met een link hieronder) is om de pdf te maken als een opdracht wordt afgerond,
zodat de klant niets hoeft af te drukken: dezelfde werkbon als pdf maken, bewaren, naar de
contactpersoon van de klant mailen, en in beide portalen tonen. Omdat de pdf vastlegt wat er
getekend is, zou hij niet veranderen als de opdracht later wordt bewerkt. Over het plan is nog niet
besloten, en er zijn nog open vragen over wie hem krijgt en hoe hij wordt verstuurd.

<HowItWorks />

**De gegevens zijn het werkverslag.** De werkbon wordt gebouwd uit het werkverslag van de opdracht
(zie [wat er van het werk wordt bijgehouden](/wiki/orders/work-record)): `loadWorkOrder(number, viewer)`
in de checklistsmodule neemt het bereik van `printedWorkOrder(number, viewer)` (voor kantoor elke
opdracht; voor een klantcontact diens afgeronde opdrachten, met alleen de apparaten op zijn
vestigingen), leest het verslag met `readWorkRecord()`, de opdracht en de klant ernaast, en elke
checklist van de getoonde apparaten. Die ene functie bedient twee pagina's, dus de versie van
kantoor en die van de klant komen uit dezelfde regels.

**De pagina** is `detail/work-order.svelte`, verpakt in `PrintSheet` met de printstijlen van de
pagina. Het is de enige plek waar de opmaak wordt bepaald. Het kantoor komt er via
`/checklists/work-orders/[number]`, en het klantportaal heeft een eigen route in dezelfde module.
Beide zijn te bereiken met een link op de checklistkaart in een slot (een plek op een pagina waar een module iets
kan neerzetten) op de pagina van de opdracht. Op kantoor (`orders.detail.side`) staat de kaart er
als de opdracht checklists heeft, ingevuld of niet. In het portaal (`client.order`) toont hij de
afgeronde checklists, en krijgt hij de knop zodra de opdracht klaar is.

**Wat het plan zou veranderen.** Het haalt de werkbon uit de checklistsmodule naar de kern, waarbij
checklists een slot vullen, zodat elke opdracht er een heeft. De pdf zou worden gemaakt door
Browser Rendering van Cloudflare, na de transactie van de afronding en nooit erbinnen, bewaard in
R2, en gemaild met `sendMail()`. Tot die tijd druk je hem af vanuit de browser.

- <SourceLink path="src/modules/checklists/server/work-order.ts" line={22}><code>loadWorkOrder()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/work-record.ts" line={116}><code>printedWorkOrder()</code></SourceLink>
- <SourceLink path="src/modules/checklists/detail/work-order.svelte">de afgedrukte pagina</SourceLink>
- <SourceLink path="docs/plans/service-report-pdf.md">het plan voor de pdf</SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="The work record" />
