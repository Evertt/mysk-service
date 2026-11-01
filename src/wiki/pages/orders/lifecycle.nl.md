---
title: De levenscyclus van een opdracht
summary: De statussen die een opdracht doorloopt, wie hem van de ene naar de volgende mag zetten, en hoe knoppen en server in de app op één lijn blijven.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import OrderLifecycle from "#wiki/widgets/order-lifecycle/order-lifecycle.svelte";
</script>

Een opdracht is werk voor een klant: een reparatie, een inspectie, een installatie. Van nieuw tot
gefactureerd heeft hij steeds één **status**, en die zegt wat er daarna mee mag gebeuren.

| Status                    | Wat het betekent                                                            |
| ------------------------- | --------------------------------------------------------------------------- |
| **Nieuw (te accepteren)** | Een klant heeft hem in zijn portaal gemeld. Een planner moet nog beslissen. |
| **Nieuw**                 | Geaccepteerd, of op kantoor gemaakt. Nog niet ingepland.                    |
| **Ingepland**             | Er is een monteur, een dag en een tijd.                                     |
| **In behandeling**        | De monteur is aan de klus begonnen.                                         |
| **Afgerond**              | Klaar. Als de monteur hem afrondt, heeft de klant getekend.                 |
| **Gefactureerd**          | Op een factuur die is verstuurd. De opdracht ligt vast.                     |
| **Geannuleerd**           | Gaat niet door, of een melding van een klant die is afgewezen.              |

Opdrachten die op kantoor worden gemaakt, beginnen als Nieuw. Alleen een melding van een klant
begint als te accepteren (zie [opdrachten die op acceptatie wachten](/wiki/orders/awaiting-acceptance)).

## Probeer de stappen

Klik op een status om te zien hoe een opdracht eruit komt en hoe hij erin komt, en wie elke stap
zet.

<OrderLifecycle />

Elke stap heeft een naam, een **werkwoord** (in de code een _verb_), en iemand die hem zet:

- **De planner** _plant_ een opdracht _in_: geeft hem een monteur (of niemand), een dag en een
  tijd. Een opdracht met de status Nieuw die een monteur krijgt, wordt Ingepland; elke andere open
  opdracht houdt zijn status.
- **De planner** _accepteert_ een melding van een klant of _wijst_ hem _af_. Geaccepteerd krijgt
  hij de status Nieuw, of meteen Ingepland als de planner hem in dezelfde stap inplant. Afgewezen
  wordt hij Geannuleerd, met een reden die de klant in zijn portaal leest.
- **De monteur** _start_ een ingeplande klus en _rondt_ de klus die in behandeling is _af_, met de
  handtekening van de klant.
- **Facturatie** maakt een afgeronde opdracht _Gefactureerd_ als er een factuur voor wordt
  verstuurd, en weer Afgerond als die factuur wordt geannuleerd.
- **Kantoor** kan een status ook met de hand _zetten_: in het opdrachtformulier, in de statuskolom
  van de lijst, of met een bulkactie. Met de hand kan het een opdracht elke status geven uit Nieuw,
  Ingepland, In behandeling, Afgerond of Geannuleerd, maar nooit Gefactureerd, en nooit bij een
  opdracht met de status Gefactureerd of Nieuw (te accepteren).

Is een opdracht eenmaal gefactureerd, dan kun je hem niet meer bewerken of verwijderen: hij staat
met zijn bedragen op een factuur. Annuleer de factuur en hij is weer Afgerond.

Dezelfde regels sturen de knoppen. De status in de opdrachtenlijst biedt alleen de statussen die
die opdracht met de hand mag krijgen, en het monteursportaal toont **Klus starten** alleen bij een
ingeplande opdracht. Ze kunnen de server niet tegenspreken, want ze vragen het aan dezelfde tabel.

<TryIt as="planner" />

<HowItWorks />

**Eén tabel.** De regels zijn `orderTransitions`, de statusovergangen (transitions), in
`src/lib/orders/lifecycle.ts`: een rij per
werkwoord (`set`, `plan`, `accept`, `reject`, `start`, `complete`, `invoice`, `uninvoice`). Een rij
zegt wie de stap zet (`by`), vanuit welke statussen en naar welke, de `action` van de regel in het
activiteitenlog, de weigering, en twee keuzes met een standaardwaarde:

- `completedAt`: volgt de status (`"follows"`: gezet als hij klaar is, anders gewist), is het
  moment van de stap (`"at"`: de afronding door de monteur, hetzelfde moment als de aftekening), of
  blijft zoals hij is (`"untouched"`).
- `same`: een stap naar de status die hij al heeft, doet niets (`"skip"`), of wordt toch gezet
  (`"move"`: die van de planner, omdat die de monteur en de tijd verandert).

Het diagram hierboven is uit die tabel getekend: hij kan niet uit de pas lopen met de app.

**Regels die eruit volgen.** Pagina's en de server vragen `mayEditOrder`, `mayDeleteOrder`,
`statusChoices`, `fieldActions`, `plannedStatus` en `can(verb, status)`, in plaats van zelf
statussen te testen.

**Eén manier om een status te wijzigen.** Elke statuswijziging gaat via
`transitionOrder(tx, { verb, … })` in `src/lib/orders/server/lifecycle.ts`, in de transactie van
wie hem aanroept. Die:

1. zoekt de opdracht binnen het bereik van het werkwoord (dat van de tenant, de organisatie; bij de
   werkwoorden van de monteur zijn eigen opdrachten);
2. controleert de rij met `can()`, en weigert anders met de melding van die rij;
3. doet één update, met de afrondingsdatum zoals de rij zegt;
4. legt de wijziging voor aan de modules (`saveOrderParts()`), die kunnen weigeren, zoals
   materialen bij te weinig voorraad;
5. doet wat het werkwoord zelf schrijft: het besluit over de melding, de aftekening;
6. logt één regel met `recordActivity()`.

Het opdrachtformulier is de enige andere die schrijft. Het slaat zijn velden en apparaten zelf op,
dus het krijgt een handle, `beginOrderChange()`, die de opdracht bewaakt en de statuskolommen geeft
om samen met die van het formulier te schrijven.

Een nieuwe manier om de status van een opdracht te wijzigen, is een rij en een werkwoord hier, nooit
een eigen update van `order.status`. Een opdracht aanmaken (`createOrders()`), verwijderen en
toewijzen houden hun eigen controles; dat zijn geen statusovergangen.

- <SourceLink path="src/lib/orders/lifecycle.ts" line={69}><code>orderTransitions</code></SourceLink>
- <SourceLink path="src/lib/orders/server/lifecycle.ts" line={66}><code>transitionOrder()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/lifecycle.ts" line={176}><code>beginOrderChange()</code></SourceLink>
- <SourceLink path="src/lib/models.ts">de statussets</SourceLink> (<code>openOrderStatuses</code>,
  <code>doneOrderStatuses</code>, …)

<DocsPointer doc="docs/agents/orders.md" section="The lifecycle" />
