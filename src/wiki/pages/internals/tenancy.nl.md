---
title: Tenancy
summary: Organisaties zijn eigenaar van alle bedrijfsgegevens, en elke query, elke wijziging en elke verwijzing is beperkt tot één organisatie, dus de records van een andere tenant zijn niet alleen verborgen maar onvindbaar.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TenancySimulator from "#wiki/widgets/tenancy-simulator/tenancy-simulator.svelte";
</script>

Fieldworks bedient veel bedrijven vanuit één app en één database. Elk bedrijf is een
**organisatie** (een _tenant_), en die is eigenaar van zijn klanten, apparaten, monteurs,
opdrachten, facturen en alles wat je verder ziet. Iemand bij het ene bedrijf kan de records van een
ander bedrijf niet zien, niet wijzigen en zelfs niet te weten komen: niet via een lijst, een
zoekopdracht, een link die iemand hem stuurt, of een id dat hij in de adresbalk typt. Een record
van een ander antwoordt precies zoals een record dat niet bestaat: met een 404.

Twee demo-organisaties laten het zien. Ingelogd bij North zie je nooit de opdrachten van South. En
iemand kan bij meer dan één organisatie horen (een boekhouder, bijvoorbeeld) en wisselt dan tussen
ze; wat hij ziet, wisselt mee.

**Optionele modules** worden ook per organisatie aangezet. Zet Facturatie uit voor een tenant, en
de pagina's van de module, zijn remote functions (functies op de server die een pagina direct
aanroept) en zijn regels in het log worden voor die tenant niet gevonden.

## Probeer het

De simulator hieronder is één tabel `order` die twee tenants delen. Draai een query als North of
South, met de scope van de tenant of zonder, voor alle opdrachten of voor één op zijn id. Kies de
opdracht van South terwijl je bij North bent ingelogd, en zet de scope uit: dat is het lek dat de
scope van elke query voorkomt.

<TenancySimulator />

<HowItWorks />

Alle gegevens van tenants staan in tabellen met een `organization_id`, en vier gewoontes houden ze
uit elkaar.

**1. Elke lees- en schrijfactie is beperkt.** Een select, update of delete op een tenant-tabel
bevat de voorwaarde van de tenant, ook bij opzoeken op id, want ids zijn globaal en komen van de
client: `inTenant(table)`, `idInTenant(table, id)`, `idsInTenant(table, ids)`. Een join naar een
tenant-tabel gaat via `tenantJoin()`, en een subquery waarvan de rijen de tenant van de buitenste
rij delen via `sameTenant(a, b)`. Een kale `eq(table.id, id)` valt op in een review, en een guard
spec (een test die de broncode leest), `hand-written.spec.ts`, weigert de uitgeschreven varianten. Zie <SourceLink path="src/lib/server/auth/session.ts" line={215}>inTenant</SourceLink> en <SourceLink path="src/lib/server/auth/session.ts" line={229}>idInTenant</SourceLink>.

**2. De gate beslist wie mag aanroepen, de handler leest wat hij toeliet.** Elke remote function
wordt gemaakt met een [gated set](/wiki/internals/gates) (functies achter een poortwachter, de gate),
en de handler leest de tenant met
`currentTenant()`. Inserts halen `organizationId` daaruit, nooit van de client.

**3. De database weigert verwijzingen tussen tenants.** Een verwijzing tussen tenant-tabellen is
een samengestelde foreign key waar de tenant in zit: `(organization_id, customer_id)` wijst naar
`customer (organization_id, id)`. Dus zelfs een bug die de klant van South aan een opdracht van
North probeerde te hangen, zou door de database geweigerd worden. Tabellen worden op één manier
gedeclareerd, met `tenantTable()` en `tenantRef()`, en een spec (`tenant-tables.spec.ts`) weigert
de handgeschreven variant. Zie <SourceLink path="src/lib/server/db/columns.ts" line={89}>tenantTable</SourceLink>.

**4. Nummers zijn per tenant.** Opdrachtnummers, klantcodes en dergelijke lopen op binnen een
organisatie: `nextNumber(tx, "order")` kiest het volgende in dezelfde transactie die het record
invoegt, en transacties gaan om de beurt, dus gelijktijdig aanmaken kan niet hetzelfde nummer
kiezen. Opdrachten worden alleen gemaakt via `createOrders(tx, drafts)` en veranderen alleen van
status via `transitionOrder()`.

**Rollen binnen een tenant** beperken verder. Een buitendienstmonteur bereikt de opdrachten die aan
hem zijn toegewezen, een klantcontact de records van de eigen klant op de vestigingen die hij ziet;
hun helpers (`engineerOrders()`, `customerOrders()`) staan in `src/lib/server/auth/`, en de
[access registry](/wiki/internals/permissions) gebruikt ze opnieuw als zijn regels.

**Tests.** Elk onderdeel test de isolatie: South kan de records van North niet zien of wijzigen,
ook niet door met ids te knoeien. In e2e is dat één pagina die voor de andere tenant een 404 is en
één formulier dat wordt verstuurd met een gemanipuleerd verborgen id; de rest staat in de
serverspec van het onderdeel, die de remote functions aanroept als South met de ids van North. Zie
[tests en guard specs](/wiki/internals/tests-and-guards).

<DocsPointer doc="docs/agents/tenancy.md" />
