---
title: Apparatuur
summary: De apparaten die op de vestigingen van klanten staan, hun servicegeschiedenis, en de QR-codes die een monteur of een klant er meteen naartoe brengen.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Een **apparaat** is één machine op de vestiging van een klant: een deur, een dockleveller, een
koelmachine. Onder **Apparatuur** houdt kantoor ze bij. Per apparaat:

- het **serienummer** (het adres van het apparaat in de app: `/equipment/<serial>`), de fabrikant en
  het model, en eventueel de eigen naam die de klant ervoor gebruikt, zoals "Automatische deur
  kantine BES-3";
- de **categorie**, een van de eigen soorten van het bedrijf (Sectionaaldeur, Docklevellers, …),
  elk met het specialisme van de monteurs die hem onderhouden;
- de **status**: in bedrijf, onderhoud nodig, buiten gebruik of afgevoerd;
- de **klant**, de **vestiging**, en eventueel de **locatie** op de vestiging;
- wanneer het is geïnstalleerd, en tot wanneer de garantie loopt.

Een **locatie** is een plek met een naam op een vestiging: "Expeditie noord", "Dock 03", "Kantoor
1e", met een hint hoe je hem vindt. Met locaties vind je de apparaten van een vestiging terug op de
plek waar ze staan.

## Servicegeschiedenis

De pagina van een apparaat vertelt zijn verhaal: een tijdlijn met de installatie, elke opdracht
eraan en het einde van de garantie (dat nog kan komen), en cijfers die het samenvatten: hoeveel
opdrachten, hoeveel daarvan open, wat het werk kostte, en hoe lang er tussen reparaties zit. Een
opdracht voor meerdere apparaten, zoals een jaarlijkse inspectie van vijftien deuren, telt bij elk
voor een vijftiende.

## QR-codes

Elk apparaat en elke locatie heeft een eigen QR-code, op een label gedrukt en erop geplakt. Wat de
code doet, hangt af van wie hem scant:

| Wie scant                            | Waar hij naartoe leidt                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Een monteur**                      | het apparaat (of de plek) in het monteursportaal, met zijn open opdrachten ervoor               |
| **Een contactpersoon van een klant** | **Storing melden**, met het apparaat al ingevuld (of de apparaten van de plek om uit te kiezen) |
| **Kantoor**                          | de pagina van het apparaat of de plek in de kantoor-app                                         |

De code werkt alleen voor wie erbij hoort: wie niet is ingelogd, gaat naar de inlogpagina en daarna
terug naar dezelfde code; iemand van een ander bedrijf, of een klant die het apparaat van een andere
klant scant, krijgt "niet gevonden", alsof de code niet bestaat.

**De labels afdrukken.** Op de vestiging van een klant drukt het labelvel de QR-labels van de
locaties en apparaten af: A4 met 3 × 8 labels van 70 × 37 mm, elk met een code, de naam, het
serienummer en waar het staat. Eén apparaat of één locatie kun je ook los afdrukken.

<TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**Tabellen.** `equipment` (het apparaat), `equipment_location` en `equipment_category`. De vestiging
van een apparaat moet er een van zijn eigen klant zijn, en de locatie een van zijn eigen vestiging:
beide zijn samengestelde foreign keys, dus de database weigert een mengsel. Een apparaat met
opdrachten kun je niet verwijderen, een locatie met apparaten ook niet, en een categorie die in
gebruik is evenmin. Serienummers zijn uniek binnen een tenant (een organisatie).

**De codes.** De URL is `/q/<token>`. Het token is niet het id van het gegeven: `newQrToken()` maakt
24 hexadecimale tekens (96 willekeurige bits) uit de cryptografische willekeurige getallen van het
platform, één keer, als het gegeven wordt aangemaakt. Zo kun je een code niet uit een andere raden,
en blijft hij hetzelfde als het apparaat een andere naam krijgt of verhuist. Een unieke index houdt
tokens uniek over alle tenants heen, en die heeft het opzoeken nodig: het is de enige plek die met
opzet over tenants heen leest, omdat de code niet zegt van wie hij is.

**Scannen** is de route `src/routes/q/[token]/+server.ts`:

1. Niet ingelogd: doorsturen naar de inlogpagina, en daarna terug naar `/q/<token>`.
2. `resolveQrCode(token, userId)` zoekt het apparaat of de locatie, en het lidmaatschap van de
   gebruiker in de tenant _daarvan_. Niets gevonden betekent 404. Is de gebruiker contactpersoon
   van een klant, dan wordt het access registry (het register dat zegt wie welke gegevens mag lezen)
   gevraagd of hij dat apparaat of die locatie mag lezen (van zijn klant, op een vestiging die hij
   ziet), anders 404.
3. Hoort de code bij een andere organisatie van de gebruiker, dan wordt dat zijn huidige.
4. `qrDestination(target, viewer)` kiest de pagina voor de shell (de omgeving) van de kijker:
   `/my/equipment/<serial>` of `/my/locations/<id>`, `/portal/report?unit=<serial>` of
   `?location=<id>`, of `/equipment/<serial>` of `/equipment/locations/<id>`.

Beide portalen noemen `/q/[token]` bij de routes die van hen zijn (`shells.ts`), zodat de guard van
de pagina's een scanner er niet van wegstuurt.

**Een apparaat lezen** gaat via `readUnits(scope)` (`src/lib/equipment/server/units.ts`), die het
apparaat teruggeeft zoals zijn lezer het ziet: kantoor ziet de garantie en het QR-token van een
locatie, de monteur de contact- en toegangsgegevens van de vestiging, de contactpersoon van de klant
alleen het adres van de vestiging. De scopes (`officeUnits()`, `engineerUnits()`,
`customerUnits(access)`) halen hun rijen uit het access registry. Zie
[wat er van het werk aan een opdracht wordt bijgehouden](/wiki/orders/work-record).

- <SourceLink path="src/lib/server/db/schema/equipment.ts" line={81}><code>equipment</code></SourceLink>, <SourceLink path="src/lib/server/db/schema/equipment.ts" line={51} symbol="equipmentLocation"><code>equipment_location</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/qr.ts" line={63}><code>resolveQrCode()</code></SourceLink> en <SourceLink path="src/lib/equipment/server/qr.ts" line={83}><code>qrDestination()</code></SourceLink>
- <SourceLink path="src/routes/q/[token]/+server.ts" line={16} symbol="GET">de route <code>/q/[token]</code></SourceLink>
- <SourceLink path="src/lib/equipment/labels/labels.remote.ts" line={18}><code>getLabelSheet</code></SourceLink>
- <SourceLink path="src/lib/equipment/detail/service-history.ts" line={67}><code>buildTimeline()</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Units and locations" />
