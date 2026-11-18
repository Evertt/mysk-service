---
title: De tijdlijn van een apparaat
summary: "Wat er met een deur gebeurt, in één lijst op zijn pagina in elke omgeving, met de cijfers van vandaag erboven: openingen, meldingen, opdrachten, condities en keuringen."
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

"Wat gebeurt er met deze deur?" De pagina van een apparaat geeft het antwoord op één plek. Bovenaan
de cijfers van vandaag: hoe vaak de deur vandaag openging en hoeveel energie erdoor verloren ging
(met de energiemodule), en de conditie op de schaal van NEN 2767, zoals "3 · Redelijk" (met de
conditiemodule). Daaronder alles wat ermee gebeurde, nieuwste eerst, per dag ("Vandaag",
"Gisteren", dan de datum), met de tijd links:

| Tijd  | Wat er gebeurde                        |
| ----- | -------------------------------------- |
| 14:30 | Opdracht afgerond, met 2 foto's        |
| 11:05 | Opdracht aangemaakt, monteur ingepland |
| 10:40 | Storing gemeld via de QR-code          |
| 08:12 | 14 min open — energieverlies gemeten   |

## Wat er in staat

- **Meldingen en opdrachten**: een gemelde storing, en hoe (via de QR-code op het apparaat, of in
  het klantportaal); een aangemaakte opdracht; een geaccepteerde melding, of een afgewezen (met de
  reden); de monteur ingepland, onderweg, aan het werk; de afgeronde opdracht, met de foto's als
  kleine plaatjes; een geannuleerde opdracht. Elk linkt naar de pagina van de opdracht in die
  omgeving.
- **Foto's en documenten** die bij de opdrachten van het apparaat en bij het apparaat kwamen.
- **De openingen van de deur** (energie): een opening die minstens zo lang is als de drempel van de
  deur op een eigen regel, "14 min open — energieverlies gemeten"; de kortere per uur geteld,
  "12× geopend · 0,4 kWh verloren", zodat een drukke deur de lijst niet overspoelt. Het kantoor ziet
  ook de meldingen.
- **Gemeten condities** (conditie): "Conditie gemeten: 3 · Redelijk, 2 gebreken", met de status die
  dat geeft ("Aandacht nodig, was In orde") en de foto's van de gebreken.
- **Afgeronde keuringen** (checklists), met hun uitkomst.
- De installatie, en voor het kantoor het einde van de garantie.

**Meer laden** leest het volgende deel. De pagina volgt de wijzigingen: een melding, een ingeplande
monteur of een conditie verschijnt zonder te herladen.

## Wie wat ziet

- **Het kantoor** ziet alles, met bij naam wie wat deed, op de pagina van het apparaat (waar het de
  plaats innam van de eigen tijdlijn van de servicehistorie; de cijfers van de service staan er nog
  boven).
- **Een monteur** ziet het bij het apparaat in het monteursportaal: de opdrachten die van hem zijn,
  mensen bij hun voornaam. Condities, en de openingen van een deur met de cijfers van vandaag, ziet
  hij op een apparaat van zijn eigen opdrachten, zoals overal in het portaal; de meldingen van de
  energiemodule blijven van het kantoor.
- **Een klantcontact** ziet het op de pagina van het apparaat in het klantportaal, onder de
  meldknop en de links, op zijn telefoon: de eigen apparaten op de locaties die hij ziet. Nooit de
  naam van de planner of van wie meldde, de monteur alleen bij zijn voornaam, geen meldingen van de
  energiemodule, geen garantie en nooit de foto's van gebreken.

<TryIt as="planner" /> <TryIt as="customer" />

<HowItWorks />

**Eén verzamelpunt, twee punten.** De tijdlijn is het uitbreidingspunt `equipment.timeline`, een
`skip`-verzamelpunt in `src/lib/equipment/extensions.ts`: met het apparaat, de kijker en waar de
pagina begint (een cursor: het moment en de id van het laatst getoonde item) geeft elke module haar
items, nieuwste eerst, hooguit een pagina vol, en of ze er oudere heeft. De kern voegt zijn eigen
toe uit het activiteitenlog. `equipment.figures` zijn de cijfers van vandaag, van het begin van de
dag van de gebruiker tot nu. Een item is `{ id, at, kind, title, detail?, order?, photos?, tone, icon }`,
de tekst op de server gemaakt, in de taal van het verzoek, voor de kijker.

**Pagina's.** `pageOf()` voegt de antwoorden samen in de volgorde van de tijdlijn (nieuwste eerst,
dan op id). Een bron die oudere items heeft dan ze gaf, houdt de pagina tegen bij haar laatste,
zodat geen van haar items wordt overgeslagen; de volgende pagina vraagt de items na het laatst
getoonde. De energiemodule leest de gebeurtenissen van haar deuren in vensters die op hele uren
eindigen, zodat de telling van een uur altijd heel is.

**Toegang.** Elke bron vraagt het toegangsregister naar haar eigen records: de kern leest de
opdrachten die de kijker mag lezen (`visibleOrNone("order")`), energie de deuren (`energy_door`) en
de meldingen (`energy_alert`, die van het kantoor), conditie de condities (`unitCondition`) en hun
foto's (`conditionPhoto`, zonder regel voor klanten), checklists de checklists. Het apparaat zelf is
aan `readOrNotFound()`: het apparaat van een andere klant, een apparaat op een locatie die het
contact niet ziet, dat van een andere organisatie of een geknoeid serienummer is een 404.

**Hoe een melding binnenkwam** staat in `order_request.via` (`qr` of `portal`). De bestemming van
de QR-code voor een klantcontact draagt `?via=qr`, dat de pagina van het apparaat doorgeeft aan het
meldformulier.

**De demo.** De Sectionaaldeur D-07 van SHLTR bij Riedel heeft de dag hierboven: de deur staat om
08:12 14 minuten open, het contact van Riedel meldt om 10:40 een storing via de QR-code, de planner
accepteert die om 11:05 en plant een monteur in, die hem om 14:30 afrondt met twee foto's. Die dag is
vandaag zodra 14:30 voorbij is, anders gisteren.

- <SourceLink path="src/lib/equipment/extensions.ts" line={50}><code>timeline</code></SourceLink> en <SourceLink path="src/lib/equipment/extensions.ts" line={66}><code>figures</code></SourceLink>
- <SourceLink path="src/lib/equipment/timeline/timeline.ts" line={121}><code>pageOf()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/timeline.ts" line={80}><code>coreEntries()</code></SourceLink> en <SourceLink path="src/lib/equipment/server/timeline.ts" line={441}><code>unitTimeline()</code></SourceLink>
- <SourceLink path="src/modules/energy/server/timeline.ts" line={67}><code>openingEntries()</code></SourceLink>
- <SourceLink path="src/modules/condition/server/timeline.ts" line={47}><code>conditionTimeline()</code></SourceLink>
- <SourceLink path="src/lib/server/db/seed/unit-story.ts" line={89}><code>seedUnitStory()</code></SourceLink>

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
