---
title: Gates voor remote functions
summary: Elke aanroep naar de server wordt gemaakt met een gated set, dus een functie kan zijn rolcontrole niet vergeten en de controle draait bij elke aanroep vóór de handler.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import GateTable from "#wiki/widgets/gate-table/gate-table.svelte";
</script>

Alles wat de browser de server vraagt te doen, zoals een lijst laden of een formulier opslaan, is
een **remote function** (een functie op de server die de pagina direct aanroept), en elke remote
function staat achter een **gate** (een poortwachter) die zegt wie hem mag aanroepen. De gate
draait eerst. Weigert hij, dan draait de eigen code van de functie nooit.

Daarom gedraagt dezelfde URL zich anders voor verschillende mensen. Een planner kan de
opdrachtenlijst laden; een monteur die dezelfde functie aanroept, krijgt een 403 en gebruikt in
plaats daarvan de functies van het monteursportaal; iemand die niet is ingelogd, krijgt een 401. Een
klantcontact komt bij de functies van het klantportaal en de paar die elke rol mag aanroepen.

Kies wie er aanroept en zie wat elke gate doet:

<GateTable />

<HowItWorks />

Een remote function wordt niet geschreven met SvelteKits eigen `query`, `form` en `command`. Die
mogen maar in één bestand geïmporteerd worden, `src/lib/server/remote-functions.ts` (een spec
controleert dat), dat ze exporteert in sets, één per gate:

```ts
export const getOrder = forMembers.query(v.string(), async (number) => {
	const { organizationId } = currentTenant();
	// …
});
```

Een functie die zijn gate vergeet, valt niet te schrijven, en dat is precies de bedoeling.

- **`gated()`** omhult de handler. Het draait de gate, en start dan de handler als het publiek
  dat de gate toeliet (`asAdmitted()`), dus een lid dat zowel beheerder als monteur is, is de
  monteur in de functies van het monteursportaal. SvelteKit heeft het argument dan al gevalideerd.
  Een `Refused` die de handler gooit (`#lib/server/refused.ts`), wordt bij een formulier
  foutmeldingen bij de velden, of een 400 bij een query of command. Zie <SourceLink path="src/lib/server/remote-functions.ts" line={71}>gated</SourceLink>.
- **De handler controleert de rol niet opnieuw.** Hij leest wat de gate toeliet: `currentTenant()`,
  `currentUser()`, `await currentEngineer()` of `await currentCustomer()` in `#lib/server/auth`.
  De opdrachten van het monteursportaal zijn beperkt tot de monteur, de queries van het
  klantportaal tot de klant.
- **De sets** zijn `remoteSet(gate, admits)`: elke set heeft `query` (met `.batch` en `.live`),
  `form` en `command`. Zie <SourceLink path="src/lib/server/remote-functions.ts" line={97}>remoteSet</SourceLink>.
  De controles (`requireMember()` en de rest) staan in <SourceLink path="src/lib/server/auth/session.ts" line={133} symbol="requireMember">session.ts</SourceLink>.
- **De set van een module** is `moduleRemote("<id>")` (of `moduleRemote(id, "manager" | "engineer" |
"customer")`), één keer aangeroepen in de `remote-functions.ts` van de module. Die voegt
  `requireModule(id)` toe: een tenant (een organisatie in de app) zonder de module krijgt een 404,
  alsof de functie niet bestaat. Een spec (`module-gate.spec.ts`) controleert dat elke module zijn
  functies bouwt uit zijn eigen set.
- **Geen `prerender`.** Niets hier is voor elke tenant hetzelfde.
- **Wat de gate niet beslist.** Hij zegt wie een functie mag _aanroepen_. Welke _records_ iemand
  bereikt, is aan de [access registry](/wiki/internals/permissions), en elke query blijft beperkt
  tot de [tenant](/wiki/internals/tenancy).

In de browser verbergt een pagina de bediening voor managers met `await canManage()`, maar dat
verbergt alleen: de gate `forManagers` weigert iedereen anders nog steeds.

<DocsPointer doc="docs/agents/tenancy.md" />
