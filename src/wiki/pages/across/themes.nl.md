---
title: Thema's
summary: Zes looks voor de hele app, elk in licht en donker, gekozen in de kopbalk en onthouden in een cookie.
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import ThemeGallery from "#wiki/widgets/theme-gallery/theme-gallery.svelte";
</script>

Fieldworks kan eruitzien als zes verschillende producten. Iedereen kiest een thema en een modus in
de kopbalk (en op de inlogpagina): de themakiezer, en de moduskiezer met licht, donker en
"Systeem", dat je systeem volgt. De keuze wordt een jaar bewaard in een cookie, dus bij je volgende
bezoek is hij hetzelfde, en omdat de server de cookie leest, flitsen er geen verkeerde kleuren
voorbij terwijl de pagina laadt. Probeer ze op deze wiki: de kiezers in de kopbalk van deze pagina
veranderen hem ook.

- **Neutral** is shadcn-svelte zoals het geïnstalleerd wordt, zonder wijzigingen.
- **Harbor** is rustig en professioneel: koel leisteengrijs, een diep petrol voor acties, een warm
  zandkleurig accent, IBM Plex Sans en zacht afgeronde hoeken.
- **Lagoon** is de standaard. Hij is strak en praktisch, naar de mockup voor de klant SHLTR: witte
  kaarten met dunne leisteengrijze randen en geen schaduwen op een koelgrijze pagina, petrol als
  merkkleur, getinte statusbadges, het systeemlettertype en hoeken van 8px op zijn kaarten, knoppen
  en velden (zijn `--radius` is 0.625rem; die gebruiken de radius `md`, 0,8 daarvan).
- **Blueprint** is tekenpapier en marineblauwe inkt met een monospace letter, vierkante hoeken en
  gestreepte hulplijnen. De donkere modus is een echte blauwdruk: lichte lijnen op
  diepblauw.
- **Brutalist** is neo-brutalisme: crèmekleurig papier, dikke zwarte lijnen, harde verschoven
  schaduwen, schreeuwend geel en roze, labels in hoofdletters en knoppen die indrukken.
- **Sorbet** is licht en luchtig: hemelsblauw getinte lucht, koraal- en zonnegele accenten, de ronde
  letter Nunito, pilvormen en bedieningselementen die verende bewegingen maken als je ze aanraakt. De
  donkere modus is een zomernacht.

Elke kaart hieronder is de echte kit (knoppen, badges, een invoerveld, een schakelaar) in dat
thema, licht en donker naast elkaar:

<ThemeGallery />

Een thema verandert hoe iets eruitziet, nooit wat het betekent. Een status krijgt zijn kleur naar
zijn betekenis (klaar, aandacht nodig, nieuw, kritiek), met dezelfde tone tokens (de kleurvariabelen
per betekenis) in elk thema, dus "afgerond" leest als goed nieuws, of de pagina nu een blauwdruk is
of een sorbet.

<HowItWorks />

Een thema is één bestand in `src/lib/themes/`, geregistreerd in <SourceLink path="src/lib/themes/index.ts" line={13} symbol="themes">index.ts</SourceLink>. De galerij hierboven en
de kiezers worden gebouwd uit die lijst (`themeNames`), dus een geregistreerd thema verschijnt in
allebei. Een guard spec van de wiki (een test die de broncode leest) faalt ook tot de `covers` van
een pagina het nieuwe thema noemt.

Een bestand heeft twee soorten styling:

- **CSS-variabelen**: kleuren, `--radius` en `--font-body`, met die in de donkere modus veranderen
  in `darkVars`. Ze worden geschreven in één stylesheet, afgebakend met `[data-theme="<name>"]`, met
  donker onder de class `.dark`, en daarom kan elk element een thema tonen, zoals de galerij doet.
- **Classes per onderdeel van een component**: Tailwind-classes per `data-slot` van een onderdeel
  (`button`, `card`, `badge`, en per waarde van een prop, zoals de `variant` en `size` van een
  knop). Een component vraagt `useTheme().classes("button", { variant, size })` en legt het
  resultaat over zijn eigen classes heen. Zo krijgt Brutalist zijn schaduwen en Sorbet zijn pillen,
  zonder dat een component van een van beide weet.
  Zie <SourceLink path="src/lib/themes/context.ts" line={21}>useTheme</SourceLink> en <SourceLink path="src/lib/themes/types.ts">het type Theme</SourceLink>.

De onderdelen die het toepassen:

1. `handleTheme` in `hooks.server.ts` leest de cookies `theme` en `mode` en zet `data-theme` en
   `data-mode` (en de class `dark`) op `<html>` in de eerste byte van het antwoord. Daarom worden de
   pagina's van de wiki op de server gerenderd en niet vooraf gebouwd (prerendered).
2. `<ThemeProvider>` geeft de classes van het thema via context aan elk component, en houdt de
   attributen gelijk als je wisselt.
3. `setTheme` en `setMode` zijn `forAnyone`-commands: ze zetten de cookie en raken geen gegevens van
   een tenant (een organisatie in de app) aan, en daarom zijn ze met opzet openbaar.

Run na het toevoegen of bijwerken van een component van shadcn-svelte `pnpm themes:sync`, zodat de
thema's zijn onderdelen kunnen stylen. Een ruwe paletkleur zoals `text-emerald-600` wordt geweigerd
door een guard (`state-colours.spec.ts`), omdat die er in elk thema hetzelfde uit zou zien.

<DocsPointer doc="docs/agents/kit.md" section="Colours and themes" />
