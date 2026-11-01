---
title: Wat Fieldworks is
summary: Een app voor buitendienstwerk, om werk bij klanten op locatie te plannen, uit te voeren en te factureren.
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
</script>

Fieldworks is een app voor buitendienstwerk: kantoor plant opdrachten op de vestigingen van
klanten, monteurs voeren ze uit, en klanten volgen alles in hun eigen portaal.

Een bedrijf dat bij zijn klanten apparatuur installeert, onderhoudt en keurt (deuren, docks,
trappen, airco) houdt hier alles bij: wie de klanten zijn, wat waar staat, welk werk er besteld
is, wie het deed en wat het kostte.

## Wie ermee werken

Drie soorten mensen gebruiken het, elk in een eigen omgeving (een _shell_):

- **Kantoor** (planners, eigenaren, beheerders) werkt in de kantoor-app. Zij beheren de klanten,
  vestigingen en apparaten, maken en plannen opdrachten, houden het dashboard en het
  activiteitenlog in de gaten, en zetten de optionele modules aan en uit.
- **Monteurs** werken in het monteursportaal, gemaakt voor de telefoon. Ze zien de opdrachten die
  voor hen gepland zijn, starten een klus, schrijven uren en notities, en ronden de klus af met de
  handtekening van de klant.
- **Klanten** werken in het klantportaal. Ze melden een storing, volgen hun opdrachten en zien hun
  eigen apparaten en vestigingen.

[Wat elke rol kan](/wiki/start/roles-and-shells) staat op een eigen pagina, en in
[de demo](/wiki/start/try-the-demo) log je als elk van hen in.

## De gegevens

Alles draait om een paar soorten gegevens:

- Een **klant** heeft **vestigingen**, en een vestiging heeft **apparaten** (de apparatuur), op
  **locaties** met een naam. Zie [Klanten](/wiki/domains/customers) en
  [Apparatuur](/wiki/domains/equipment).
- Een **opdracht** is werk voor een klant, meestal aan een of meer van zijn apparaten. Die
  doorloopt een vaste [levenscyclus](/wiki/orders/lifecycle), van nieuw tot gefactureerd.
- Een **monteur** voert opdrachten uit. Zie [Monteurs](/wiki/domains/engineers).

## Wat er nog meer in zit

- **Meerdere bedrijven, één app.** Elk bedrijf is een organisatie (een _tenant_) en ziet alleen
  zijn eigen gegevens. Niemand komt bij die van een ander door een id te raden.
- **Optionele modules.** Servicecontracten, facturatie, onderhoudsplannen, planning, materialen,
  werkbonnen met checklists en nog een paar zet je per organisatie aan. Een organisatie zonder een
  module ziet die niet.
- **Engels en Nederlands**, en een keuze uit thema's, in licht en donker.
- **Live pagina's.** Als een collega een opdracht wijzigt, zie je dat op je pagina zonder te
  herladen.
- **QR-codes** op apparaten en plekken brengen een monteur naar het apparaat, en een klant naar
  "storing melden" voor dat apparaat.

<HowItWorks />

Fieldworks is een SvelteKit-app op Svelte 5, met remote functions (functies op de server die een
pagina direct aanroept), op SQLite met Drizzle: libsql op Node, een Durable Object op Cloudflare.
Inloggen gaat met better-auth, de teksten met Paraglide (Engels en Nederlands), en de tooling is
Vite+ met pnpm.

De code is verdeeld naar wie de eigenaar is:

- De vier **kerndomeinen** (opdrachten, klanten, apparatuur, monteurs) staan in
  `src/lib/<domain>/`, per onderdeel: `ui/`, `list/`, `form/`, `detail/`, `server/`.
- Elke **optionele module** staat helemaal in `src/modules/<id>/`. De kern importeert nooit een
  module; een module voegt iets toe aan de kern via extension points (plekken waar de kern ruimte
  laat voor modules).
- De drie **shells** zijn route groups (mappen met de routes van één omgeving): `(app)` voor
  kantoor, `(field)/my` voor de monteurs en `(customer)/portal` voor klanten. In
  `src/lib/auth/shells.ts` staat waar elke shell begint en welke pagina's van hem zijn.
- Organisaties zijn eigenaar van alle bedrijfsgegevens. Elke query op een tenant-tabel is beperkt
  tot de ingelogde organisatie, en elke wijziging komt in het activiteitenlog.

<DocsPointer doc="docs/agents/structure.md" section="Where files go" />

Bron: <SourceLink path="src/lib/auth/shells.ts" line={28} symbol="shells">de shells</SourceLink>, <SourceLink path="src/lib/modules/manifests.ts">de modulemanifesten</SourceLink>.
