---
title: Monteurs
summary: De mensen die opdrachten uitvoeren, hun specialisme en tarief, hoe het account van een monteur aan zijn gegevens wordt gekoppeld, en wat hij ziet.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een **monteur** is iemand die opdrachten uitvoert. Onder **Monteurs** in de kantoorapp beheer je
ze: een naam, e-mail en telefoon; een **specialisme** (elektrotechniek, werktuigbouw,
klimaattechniek, sanitair of regeltechniek); een **regio** (Noord, Oost, Zuid, West of Midden, of
een eigen regio); een **uurtarief**; wanneer ze in dienst kwamen; en of ze **actief** zijn.

De pagina van een monteur toont zijn profiel en zijn werk: de opdrachten die hij open heeft, de
eerstvolgende bovenaan, de opdrachten die hij het laatst afrondde, en hoeveel uur hij de afgelopen
30 dagen boekte en wat dat aan arbeid waard was.

## Een opdracht een monteur geven

Een opdracht inplannen is een monteur, een dag en een tijd kiezen. De lijst met monteurs zet de
monteurs met een specialisme dat bij de opdracht past bovenaan: de categorie van elk apparaat zegt
welk specialisme het onderhoudt, dus bij een opdracht aan een apparaat waarvan de categorie bij
klimaattechniek hoort, staan de monteurs met klimaattechniek bovenaan. Je kunt nog steeds iedereen
kiezen die actief is. Een inactieve monteur kan geen nieuw werk krijgen, en een opdracht die nog te
accepteren of al gefactureerd is, kun je helemaal niet toewijzen.

Het uurtarief bepaalt de prijs van de arbeid bij de opdrachten die een monteur doet: de uren die hij
schrijft maal zijn tarief. Een opdracht die nog geen monteur heeft, wordt geschat op basis van een
standaardtarief.

Een klant ziet alleen de **voornaam** van een monteur, bij zijn opdrachten.

## Inloggen als monteur

De gegevens van een monteur zijn geen gebruikersaccount. Om een monteur het monteursportaal te laten
gebruiken, doet een eigenaar of beheerder twee dingen: hij nodigt de persoon uit voor de
organisatie met de rol `engineer` (onder **Instellingen → Leden**), en **koppelt** daarna op de
bewerkpagina van de monteur de monteur aan dat account. De koppeling is één-op-één: een account kan
aan één monteur in de organisatie gekoppeld zijn, en de pagina biedt alleen leden aan die nog niet
gekoppeld zijn.

Vanaf dan komt de monteur in het monteursportaal terecht, en ziet hij alleen de opdrachten die aan
hem zijn toegewezen.

<TryIt as="engineer" />

## Een monteur verwijderen

Een monteur met toegewezen opdrachten kun je niet verwijderen; de pagina zegt hoeveel het er zijn.
Maak hem in plaats daarvan inactief: dan houdt hij zijn geschiedenis, maar wordt hij niet meer
aangeboden voor nieuw werk.

<HowItWorks />

**Eén tabel, met een account als dat er is.** `engineer` heeft de profielkolommen en een `userId`
die leeg mag zijn en naar het gebruikersaccount verwijst. `engineer_user_organization` is uniek, dus
een gebruiker is per tenant (per organisatie) hooguit één monteur. Het tarief wordt in centen
opgeslagen. `order.engineerId` verwijst naar de monteur met een samengestelde sleutel waar de tenant
in zit.

**Beperkt tot de monteur.** De remote functions van het monteursportaal (functies op de server die
een pagina direct aanroept) worden gemaakt met `forEngineers`. De gate daarvan (de
toegangscontrole), `requireEngineer()`, zoekt één keer per verzoek de monteur die aan het account
gekoppeld is, en `await currentEngineer()` geeft die terug. De opdrachten die een monteur bereikt,
zijn de opdrachten van de tenant die aan hem zijn toegewezen, via helpers die het id van de monteur
zelf lezen: `engineerOrders()` voor een query, `engineerOrder(ref)` voor één opdracht, en
`engineerOrderNotFound(ref)` voor de ene 404. Een record dat een monteur schrijft, krijgt de
monteur van de opdracht die hij bereikte. Een spec (een test die dit bewaakt) houdt het id van
de monteur binnen dat bestand. Apparaten en locaties (de QR-pagina's) zijn voor elke monteur die van
de tenant.

**Koppelen** is `linkEngineerAccount`, een `forManagers`-formulier: het controleert dat de gebruiker
lid is van de tenant en niet aan een andere monteur gekoppeld is, werkt `userId` bij, en logt het,
met de accounts bij naam.

**Verwijderen** is `removeEngineer`, gemaakt door `defineRemoval()`: de blockers (wat het verwijderen tegenhoudt) zijn de opdrachten
die aan de monteur zijn toegewezen.

**De volgorde van de monteurs** voor een opdracht is `fittingFirst(engineers, specialties)` in
`src/lib/engineers/display.ts`; de specialismen zijn die van de categorieën van de apparaten van de
opdracht, het eerste apparaat eerst.

- <SourceLink path="src/lib/server/db/schema/engineers.ts" line={9}><code>engineer</code></SourceLink>
- <SourceLink path="src/lib/engineers/form/account.remote.ts" line={49}><code>linkEngineerAccount</code></SourceLink>
- <SourceLink path="src/lib/engineers/display.ts" line={58}><code>fittingFirst()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/pricing.ts" line={15}><code>laborCost()</code></SourceLink>

<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />
