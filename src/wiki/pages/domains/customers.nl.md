---
title: Klanten
summary: De bedrijven waarvoor het werk wordt gedaan, hun vestigingen, en hoe die samenhangen met apparaten en opdrachten; en wie van een klant het portaal mag gebruiken.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import RecordsDiagram from "#wiki/widgets/records/records-diagram.svelte";
</script>

Een **klant** is een bedrijf dat apparatuur bezit en werk bestelt. Onder **Klanten** in de
kantoorapp beheer je ze: een code (`CUST-0001`, genummerd door de app), een naam, een
contactpersoon met e-mail en telefoon, een plaats en land, en een segment (grootzakelijk,
middenmarkt of kleinbedrijf).

De pagina van een klant toont de kerncijfers (open opdrachten, omzet, hoeveel apparaten aandacht
nodig hebben, het jaar waarin hij klant werd), het contact, de vestigingen, de apparaten, en wat er
de laatste tijd is veranderd.

## Vestigingen

Een bedrijf heeft zelden maar één adres. Een klant heeft een of meer **vestigingen**, zoals "Ede" of
"Hoofdvestiging", en het werk gebeurt op een vestiging. Per vestiging houd je bij:

- het adres, en een contactpersoon voor de vestiging als dat niet die van de klant is;
- hoe de vestiging het liefst benaderd wordt (e-mail, telefoon, WhatsApp, portaal);
- de dag en de uren waarop een bezoek uitkomt;
- een prioriteit, en **toegangsinstructies**: "Melden bij receptie expeditie noord."

De monteur ziet die bij de opdracht, zodat hij weet naar wie hij moet vragen en hoe hij binnenkomt.
Een klant houdt altijd minstens één vestiging, want zijn apparaten moeten ergens staan.

## Hoe de gegevens samenhangen

<RecordsDiagram />

Lees een pijl als "heeft": een klant heeft vestigingen, apparaten en opdrachten. Een vestiging heeft
locaties (plekken met een naam, zoals "Dock 03") en apparaten. Een apparaat staat op één vestiging,
en kan op een van de locaties van die vestiging staan. Een opdracht is voor een klant, gaat over een
paar apparaten van die klant (geen bij een Offerte opname of een nieuwe installatie), en kan een monteur
hebben. De apparaten van de klant, de apparaten van de opdracht en de vestiging van het apparaat
zijn altijd van dezelfde klant: de database weigert een mengsel.

## Portaaltoegang

De contactpersonen van een klant kunnen het klantportaal gebruiken. Op de pagina van de klant, onder
**Portaaltoegang**, nodigt een eigenaar of beheerder een contactpersoon uit per e-mail, voor alle
vestigingen van de klant of voor een paar ervan. De contactpersoon accepteert de uitnodiging, krijgt
een account, en ziet vanaf dan alleen de opdrachten, apparaten en vestigingen van die klant. Als je de
toegang intrekt, is de contactpersoon er niet meer bij. Iedereen op kantoor ziet wie toegang heeft; alleen eigenaren en
beheerders kunnen dat wijzigen.

<TryIt as="planner" />

## Een klant verwijderen

Een klant kun je alleen verwijderen zolang hij geen apparaten en geen opdrachten heeft; anders zegt
de pagina hoeveel hij er heeft. Een vestiging kun je alleen verwijderen zolang die geen apparaten
heeft, en de laatste van een klant nooit. Een module die gegevens bij een vestiging bewaart (de
dockposities van Docks, een energielocatie) kan ook weigeren, en zegt dan wat je eerst moet
verwijderen.

<HowItWorks />

**Vier tabellen.** `customer`, `customer_site` en (voor het portaal) `portal_contact` en
`portal_contact_site`. Elke tabel heeft een `organizationId`, en verwijzingen ertussen zijn
samengestelde foreign keys waar de tenant (de organisatie) in zit, zodat een rij niet naar een
andere tenant kan wijzen. Waar een record bij dezelfde klant moet horen (de vestiging van een
apparaat, de apparaten van een opdracht, de vestigingen van een contactpersoon), zit ook
`customer_id` in de sleutel. Het diagram hierboven is uit die sleutels getekend.

**Codes.** De code van een klant wordt gekozen door `nextNumber(tx, "customer")`, in dezelfde
transactie die de klant invoegt, zodat twee klanten die tegelijk worden aangemaakt niet dezelfde
code kunnen krijgen. De code is uniek binnen een tenant; een andere tenant mag dezelfde gebruiken.

**Verwijderen is een definitie, geen functie.** `removeCustomer` wordt gemaakt door
`defineRemoval()`: die zoekt de klant in de tenant of antwoordt met 404, vraagt de `blockers`
(apparaten en opdrachten), verwijdert hem en logt het, in één transactie. De klantpagina en het
bulkverwijderen in de lijst gebruiken hem allebei. Vestigingen doen hetzelfde in `removeSite()`,
waar de modules meestemmen via het extension point `removingSite` (een plek waar de kern ruimte
laat voor modules).

**Portaalcontactpersonen** zijn leden met de rol `customer`, gekoppeld aan een `portal_contact`.
Elke query van hen is beperkt tot de tenant, hun klant en hun vestigingen (`ofCustomer()`,
`atSites()`, `customerOrders()`), en het access registry (het register dat zegt wie welke gegevens
mag lezen of wijzigen) beslist de rest. Zie [wat elke rol in welke shell kan](/wiki/start/roles-and-shells).

**Wat een vestiging toont**, hangt af van wie hem leest. Kantoor, en een monteur op de vestigingen
van zijn opdrachten, zien de contactvoorkeuren en toegangsinstructies (de kolommen `onSite`); een
contactpersoon van de klant ziet alleen het adres.

- <SourceLink path="src/lib/server/db/schema/customers.ts" line={8}><code>customer</code></SourceLink> en <SourceLink path="src/lib/server/db/schema/customers.ts" line={35} symbol="customerSite"><code>customer_site</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/portal.ts" line={16} symbol="portalContact"><code>portal_contact</code></SourceLink>
- <SourceLink path="src/lib/customers/server/customers.ts" line={13}><code>removeCustomer</code></SourceLink>
- <SourceLink path="src/lib/customers/detail/portal-access.remote.ts" line={119}><code>invitePortalContact</code></SourceLink>
- <SourceLink path="src/wiki/widgets/records/records-diagram.svelte">het diagram</SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
