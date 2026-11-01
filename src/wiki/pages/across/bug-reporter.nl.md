---
title: Bugmelder
summary: Een gebruiker neemt op hoe hij tegen een probleem aanloopt, en een developer kijkt dat terug met de console en de requests ernaast.
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

"Het werkte niet" is een melding waar je weinig mee kunt. De bugmelder vervangt die door een
opname.

1. Klik op kantoor op het bug-icoon in de kopbalk. Kies in het monteursportaal "Probleem melden" in
   het menu in de kopbalk. (Het klantportaal heeft geen recorder.)
2. Doe wat er misging. Het icoon wordt een rode, kloppende stip met een lopende timer, zodat je ziet
   dat de pagina wordt opgenomen.
3. Klik erop om te stoppen, of laat hem na tien minuten vanzelf stoppen. Voeg eventueel een
   toelichting toe en verstuur.

Herlaad je de pagina, dan ben je de opname niet kwijt: zodra de pagina terug is, kun je hem alsnog
versturen.

De developers krijgen een e-mail met wie, waar, de toelichting, de browser en de fouten die de
console logde, en een link naar een terugkijkpagina. Daar zien ze de sessie terug zoals de
gebruiker hem zag, naast een lijst van de fouten en waarschuwingen uit de console en een lijst van
de requests die de pagina deed. Klik je op een regel in een van beide, dan springt de opname naar
dat moment.

Wat er wel en niet wordt opgenomen:

- **Het neemt de pagina op, niet het scherm.** Wat je ziet, wordt opnieuw opgebouwd uit de opbouw
  van de pagina, je klikken, je scrollen en wat je typt. Niets buiten het browsertabblad wordt
  vastgelegd.
- **Wachtwoordvelden worden afgeschermd**, en elk element met `data-private` blijft weg. Andere
  velden worden opgenomen zoals je ze typt, dus typ niets wat je de developers niet zou laten zien.
- **Requests worden vastgelegd met naam, status, duur en grootte**, nooit met wat ze verstuurden
  of terugkregen.

<TryIt as="planner" />

<HowItWorks />

<Diagram viewBox="0 0 440 150" label="De recorder in de browser stuurt een melding naar de server, die de opname bewaart en de developers mailt, die hem terugkijken.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="40" width="110" height="60" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="59" y="66" fill="var(--foreground)">Recorder</text>
		<text x="59" y="84" fill="var(--muted-foreground)">rrweb, gezipt</text>
		<rect x="152" y="40" width="136" height="60" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="220" y="66" fill="var(--foreground)">POST /bug-reports</text>
		<text x="220" y="84" fill="var(--muted-foreground)">opslag, rij, mail</text>
		<rect x="326" y="40" width="110" height="60" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="381" y="66" fill="var(--foreground)">Terugkijken</text>
		<text x="381" y="84" fill="var(--muted-foreground)">voor developers</text>
		<path d="M 116 70 H 150 M 290 70 H 324" stroke="var(--muted-foreground)" stroke-width="1.5" fill="none" />
		<path d="M 145 65 l 6 5 l -6 5 M 319 65 l 6 5 l -6 5" stroke="var(--muted-foreground)" stroke-width="1.5" fill="none" />
	</g>
</Diagram>

- **Opnemen.** De recorder laadt rrweb bij de eerste opname (het zit niet in de bundle van de app),
  met de console-plugin voor fouten en waarschuwingen, en wikkelt `fetch` in om de aanroepen van
  remote functions (functies op de server die de pagina direct aanroept) vast te leggen. Eén
  recorder per tabblad, buiten elk component, zodat een opname doorloopt als je zonder herladen naar
  een andere pagina gaat, ook van kantoor naar het monteursportaal. Zijn fases (`idle`, `recording`, `stopping`,
  `sending`) en de stappen ertussen vormen een kleine state machine. Zie <SourceLink path="src/lib/bug-reports/recorder.svelte.ts" line={71} symbol="record">de opties van rrweb</SourceLink>
  en <SourceLink path="src/lib/bug-reports/machine.ts" line={11} symbol="Phase">de fases</SourceLink>.
- **Grenzen.** `maxRecordingMs` is tien minuten, `maxReportBytes` 20 MB gezipt. De server weigert
  een request zonder `Content-Length` (411) en een boven de grens (413) voordat hij één byte leest.
- **Het endpoint** is `POST /bug-reports`, een gewoon endpoint en geen remote form, omdat de
  recorder vanuit een script verstuurt en het endpoint eerst de lengte kan controleren. Het laat een
  kantoorlid of een buitendienstmonteur toe, geen klantcontact, en bewaart de melding onder de eigen
  tenant en gebruiker van de melder, wat de body ook zegt. Zie <SourceLink path="src/lib/server/bug-reports/upload.ts" line={64}>receiveBugReport</SourceLink>.
- **Opslag.** Eerst de opname, dan de rij in `bug_report`, dan de mail, buiten elke transactie. Op
  Cloudflare staan de opnames in een R2-bucket (`BUG_REPORTS`); elders in een map. Beide zitten
  achter één kleine `BugReportStore`.
- **Wie mag terugkijken.** De pagina's staan op `/ops/bug-reports` en gebruiken de gate
  `forDevelopers`: alleen ingelogde gebruikers van wie het e-mailadres in `DEVELOPER_EMAILS` staat,
  in elke organisatie, en een 404 voor iedereen anders, zodat de pagina's niet verraden dat ze
  bestaan. Zie [de gates](/wiki/internals/gates).

<DocsPointer doc="docs/plans/bug-recorder.md" />
