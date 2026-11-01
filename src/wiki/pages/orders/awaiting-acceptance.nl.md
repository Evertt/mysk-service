---
title: Te accepteren opdrachten
summary: Hoe een storing die een klant meldt, wacht tot een planner hem accepteert of afwijst, en wat hij tot die tijd wel en niet telt.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een klant die een apparaat ziet uitvallen, belt niet naar kantoor: hij opent het klantportaal en
kiest **Storing melden**, bij het apparaat (of door de QR-code te scannen), met een beschrijving en
een urgentie (normaal, hoog of spoed). Daarmee ontstaat een opdracht, maar nog geen werk. Die heeft
de status **Nieuw (te accepteren)** tot een planner beslist.

## Wat de klant ziet

Zijn opdracht staat erbij als wachtend op kantoor. Zodra de planner beslist, ziet hij dat
veranderen: ingepland, met de voornaam van de monteur, of **afgewezen, met de reden die de planner
schreef**.

## Wat kantoor ziet

- Een badge bij **Opdrachten** in het menu en een kaart op het dashboard tellen de meldingen die
  wachten. De kaart opent de opdrachtenlijst, gefilterd op die meldingen. De bel geeft een melding
  voor elke nieuwe.
- Op de pagina van de opdracht zegt een kaart wie hem meldde en wanneer. De kaart heeft twee
  knoppen:
  - **Accepteren.** De opdracht krijgt de status Nieuw. Of vul een monteur, een dag en een tijd in,
    dan is hij meteen ingepland, alsof hij in dezelfde stap werd ingepland.
  - **Afwijzen.** Een reden is verplicht. De opdracht wordt geannuleerd en de klant leest de reden.
- Is er beslist, dan zegt de kaart wat er besloten is en door wie.

Elk kantoorlid kan beslissen, net als bij inplannen. Opdrachten die op kantoor worden gemaakt,
wachten nooit: die beginnen met de status Nieuw.

## Zolang er niet beslist is, is het geen werk

Een te accepteren opdracht blijft bewust buiten alles wat werk telt of plant:

- hij staat niet op de planning en niet bij Nog in te plannen;
- hij legt geen voorraad vast, en krijgt geen checklists;
- hij kan geen monteur of planning krijgen, en ook geen status met de hand, en hij kan niet worden
  bewerkt (de server weigert met "accepteer eerst");
- hij _kan_ wel worden verwijderd;
- bij een servicecontract loopt de reactietijd al vanaf het moment van de melding, niet vanaf de
  acceptatie: het wachten van de klant telt mee.

<TryIt as="customer" />

<HowItWorks />

**Het aanmaken.** Het formulier `reportBreakdown` van het portaal controleert of het apparaat er een
is dat de contactpersoon ziet, en roept dan `requestOrder(tx, draft)` aan in een transactie. Dat is
`createOrders()` (gecontroleerd, genummerd, gelogd als aangemaakt, door de contactpersoon) met de
status `awaiting_acceptance`, plus een rij in `order_request` die bijhoudt wie hem meldde
(`reporterName`) en, later, wie besliste, wanneer en waarom.

**Geen open werk.** `openOrderStatuses` bevat `awaiting_acceptance` niet; `pendingOrderStatuses`,
wat volgens de klant nog gedaan moet worden, wel. `holdsStock()` van de materialenmodule en
`waitingStatuses` van de contractenmodule (`src/modules/contracts/coverage.ts`) maken de regels
voor voorraad en reactietijd hierboven.

**Beslissen.** Beide knoppen roepen `transitionOrder()` aan, de enige manier om een status te
wijzigen (zie [hoe een opdracht door zijn statussen gaat](/wiki/orders/lifecycle)):

- `accept`: van te accepteren naar nieuw, gelogd als _geaccepteerd_. Met een planning roept hij
  daarna in dezelfde transactie het werkwoord `plan` aan (gelogd als _ingepland_).
- `reject`: naar geannuleerd, gelogd als _afgewezen_, met de reden als notitie bij de logregel.

Dat zijn `acceptReportedOrder` en `rejectReportedOrder`, met een gate voor elk kantoorlid
(`forMembers`): de toegangscontrole die vóór de functie op de server draait. Een opdracht waarover
al beslist is, wordt geweigerd.

**De telling.** `awaitingAcceptance(organizationId)` telt de opdrachten voor de badge in het menu.

- <SourceLink path="src/lib/orders/server/acceptance.ts" line={22}><code>requestOrder()</code></SourceLink>
- <SourceLink path="src/routes/(customer)/portal/client.remote.ts" line={186}><code>reportBreakdown</code></SourceLink>
- <SourceLink path="src/lib/orders/detail/acceptance.remote.ts" line={35}><code>acceptReportedOrder</code></SourceLink>
  en <SourceLink path="src/lib/orders/detail/acceptance.remote.ts" line={61}><code>rejectReportedOrder</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={169} symbol="orderRequest"><code>order_request</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Orders awaiting acceptance" />
