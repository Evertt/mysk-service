---
title: Opdrachttypes
summary: De negen soorten opdrachten, welke daarvan correctief werk zijn, en hoe een bedrijf types een eigen naam geeft of de types verbergt die het niet gebruikt.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Elke opdracht heeft een **type**, dat zegt wat voor werk het is. Er zijn er negen, in de volgorde
waarin het opdrachtformulier ze aanbiedt:

| Type               | Wat het is                                                                   |
| ------------------ | ---------------------------------------------------------------------------- |
| **Storing**        | Iets werkt niet meer en de klant heeft ons erbij geroepen.                   |
| **Reparatie**      | Herstellen wat er mis is gegaan met een apparaat.                            |
| **Onderhoud**      | Een apparaat onderhouden volgens zijn interval.                              |
| **Inspectie**      | Een apparaat controleren aan de hand van een norm.                           |
| **Installatie**    | Een nieuw apparaat plaatsen.                                                 |
| **Offerte opname** | Een opname van een vestiging of een apparaat.                                |
| **Schade**         | Werk na een ongeluk of door derden, niet veroorzaakt door het apparaat zelf. |
| **Project**        | Projectwerk.                                                                 |
| **Overig**         | Alles wat bij geen van de andere past.                                       |

Een storing met prioriteit **Spoed** is wat SHLTR een "storing prio" noemt. Prioriteit (laag,
normaal, hoog, spoed) is een veld apart, geen type.

**Storingen en reparaties zijn correctief werk.** De app telt die mee als hij uitrekent hoe vaak een
apparaat reparatie nodig heeft, en als hij de reactietijd van een servicecontract controleert.
Schade is niet correctief, want die komt niet door het apparaat.

Een klant die in het portaal een storing meldt, maakt altijd een `breakdown`; de urgentie die hij
kiest, wordt de prioriteit van de opdracht.

## Eigen namen, en de types die je niet gebruikt

De lijst met types ligt vast: de regels van de app hangen ervan af (contractdekking, reactietijden,
checklists), dus een bedrijf kan er geen toevoegen. Het kan wel twee dingen, onder
**Instellingen → Opdrachttypes** (eigenaren en beheerders):

- Een type **een eigen naam** geven, per taal. SHLTR zou _Offerte opname_ bijvoorbeeld "Opname"
  kunnen noemen. Een taal die leeg blijft, houdt de standaardnaam. De nieuwe naam staat overal waar
  het type staat: lijsten, filters, badges, de portalen.
- Een type **verbergen** in het opdrachtformulier. Opdrachten die het al hebben, houden het, en het
  blijft in de filters staan.

Twee regels houden dit veilig. Geen twee types mogen in een taal hetzelfde heten (hoofdletters of
niet), zodat je ze uit elkaar kunt blijven houden. En een type dat ergens voor nodig is, blijft
beschikbaar: **storing** is altijd nodig (het klantportaal maakt ze aan), en dat geldt ook voor elk
type waarmee een ingeschakelde module werkt. Onderhoudsplannen maken bijvoorbeeld opdrachten van het
type _onderhoud_ en _inspectie_, dus met die module aan kun je geen van beide verbergen. De
instellingenpagina zegt waarvoor elk type nodig is.

<TryIt as="planner" />

<HowItWorks />

**De types zijn een enum** in `src/lib/models.ts` (`orderTypes`), gedeeld door het schema, de seed
en de UI. De wijzigingen van een tenant (een organisatie) zijn rijen in `order_type_setting`: het
type, de namen per locale (JSON) en `hidden`. Een type waaraan niets is gewijzigd, heeft geen rij,
en als je het terugzet naar standaard, wordt de rij verwijderd.

**De labels lezen de namen van de tenant.** `label("orderType", value)` vraagt `nameOrderTypes()`
(`src/lib/orders/types.ts`) eerst om de naam van de tenant, en valt anders terug op het
standaardlabel. Op de server komen de namen van de tenant van het verzoek, die er één keer mee
wordt geladen (`loadTenant()`). In de browser wacht de layout van elke shell op `getOrderTypes()` en
koppelt die aan. De opgeslagen waarden, de filters en de URL's houden de eigen ids van de types.

**Wat het formulier aanbiedt**, is `offeredOrderTypes(settings, current)`: de types die niet
verborgen zijn, plus het eigen type van de opdracht als dat sindsdien is verborgen.

**Wat niet verborgen mag worden**, bepaalt `requiredOrderTypes(enabled)` in
`src/lib/orders/server/types.ts`: die geeft storing, en elk type in de `orderTypes` van het manifest
van een ingeschakelde module. `effectiveOrderTypes()` negeert de vlag `hidden` bij een type dat
nodig is, ook als die werd gezet voordat de module aan werd gezet.

**Opslaan** is `saveOrderTypeSetting()` in hetzelfde bestand, die wordt aangeroepen door
`saveOrderType` (`src/lib/orders/type-settings/type-settings.remote.ts`), een remote form (een
formulier dat direct een functie op de server aanroept) alleen voor managers.
`orderTypeProblems()` vindt wat er mis is (een type dat nodig is maar verborgen, een naam die al
bezet is), de transactie vervangt of verwijdert de rij, en de wijziging wordt gelogd.

- <SourceLink path="src/lib/models.ts" line={36}><code>orderTypes</code> en correctief werk</SourceLink>
- <SourceLink path="src/lib/orders/types.ts" line={58}><code>offeredOrderTypes()</code></SourceLink> en <SourceLink path="src/lib/orders/types.ts" line={91}><code>orderTypeProblems()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/types.ts" line={32}><code>requiredOrderTypes()</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={102} symbol="orderTypeSetting"><code>order_type_setting</code></SourceLink>

<DocsPointer doc="docs/agents/i18n.md" />
