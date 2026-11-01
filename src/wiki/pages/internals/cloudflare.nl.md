---
title: Cloudflare en het Durable Object
summary: De app draait als een Cloudflare Worker waarvan één Durable Object de hele database bevat, dus een query is een functieaanroep.
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

Fieldworks kan op twee plekken draaien. Op een gewone Node-server gebruikt het een libsql-database
(een lokaal bestand, of Turso). Op **Cloudflare Workers** draait het aan de edge (op servers dicht
bij de gebruiker), met de database in hetzelfde proces, en zo draaien de productie- en de
staging-omgeving.

Wat dat betekent voor wie de app gebruikt:

- **Het is snel.** Er zit geen netwerkstap tussen de code en de gegevens, dus een query is een
  functieaanroep en geen heen-en-weer naar een databaseserver.
- **Dagelijkse taken draaien vanzelf.** Om 04:00 UTC start een cron trigger (een getimede opdracht)
  de dagelijkse taken, zoals de onderhoudsplannen die opdrachten worden. Elke 15 minuten laat een
  andere de simulaties van de demo een stap zetten, zodat de modules Docks en Energie gegevens hebben
  die live lijken.
- **Opnames en mail hebben een plek.** De opnames van de bugmelder gaan naar een R2-bucket,
  uitnodigingen en herinneringen gaan via SMTP de deur uit.
- **Een vangnet.** Cloudflare bewaart 30 dagen geschiedenis van de database, zodat die terug te
  zetten is naar een moment in de tijd.
- **Staging is echt, maar wegwerp.** Elke push naar `develop` zet een eigen Worker neer, met een
  eigen database, die bij elke deploy opnieuw met de demogegevens wordt gevuld. De inlogpagina daar
  heeft het inloggen met één klik voor de demo; die van productie niet.

<Diagram viewBox="0 0 440 180" label="Een request komt bij de Worker, die het naar het ene Durable Object stuurt. Daarin draaien SvelteKit en de SQLite-database samen. Cron triggers roepen het object ook aan. Opnames van de bugmelder gaan naar een R2-bucket.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="60" width="86" height="44" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="47" y="86" fill="var(--foreground)">Worker</text>
		<rect x="140" y="10" width="190" height="130" rx="10" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="235" y="30" font-weight="600" fill="var(--foreground)">Durable Object</text>
		<text x="235" y="46" fill="var(--muted-foreground)">AppDatabase, één voor alles</text>
		<rect x="156" y="62" width="76" height="40" rx="6" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="194" y="86" fill="var(--foreground)">SvelteKit</text>
		<rect x="240" y="62" width="76" height="40" rx="6" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="278" y="86" fill="var(--foreground)">SQLite</text>
		<rect x="360" y="20" width="76" height="40" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="398" y="44" fill="var(--foreground)">Cron</text>
		<rect x="360" y="100" width="76" height="40" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="398" y="124" fill="var(--foreground)">R2</text>
		<path d="M 92 82 H 138 M 358 40 H 332 M 332 120 H 358" fill="none" stroke="var(--muted-foreground)" stroke-width="1.5" />
		<path d="M 234 82 H 240" fill="none" stroke="var(--muted-foreground)" stroke-width="1.5" />
	</g>
</Diagram>

<HowItWorks />

**Eén object doet alles.** De Worker (`wrangler.jsonc`, `main: cloudflare/entry.ts`) stuurt elk
request naar het enige Durable Object (een object van Cloudflare met eigen opslag) van de app,
`AppDatabase`. Statische bestanden bereiken het
nooit, want die levert Cloudflare zelf al. Het object migreert zijn SQLite-database als het start
(`blockConcurrencyWhile`), en beantwoordt daarna elk request door SvelteKit in zichzelf te draaien,
met zijn opslag doorgegeven in een `AsyncLocalStorage` (`durableRequests`). `db` vindt hem daar,
dus de code van de app is op Node en op Cloudflare dezelfde. Zie <SourceLink path="cloudflare/entry.ts" line={49}>AppDatabase</SourceLink> en <SourceLink path="src/lib/server/db/durable.ts" line={53}>drizzleDurable</SourceLink>.

Wat daaruit volgt:

- **Transacties houden elk ander request op.** In het object draaien ze in
  `storage.transaction()`, dat om de beurt gaat met alle andere requests (zoals `drizzleQueued`
  libsql laat doen). Dus I/O zoals mail of `fetch` blijft buiten een transactie, anders wacht de
  hele app erop. Geneste transacties horen bij de buitenste; savepoints bestaan niet.
- **Een statement bindt hoogstens 100 waarden.** Dat is de grens van het Durable Object (libsql
  neemt er 32.766), en `db` dwingt hem overal af, ook in tests. Lijsten van waarden gaan via
  `inList()` en `insertRows()`.
- **Live wijzigingen staan in het geheugen.** `announceChange()` bereikt de live queries van het
  object, dat elk request bedient, dus [live updates](/wiki/across/live-updates) werken zonder
  broker. Een Node-omgeving met meer instanties zou er een nodig hebben.
- **Code die draait terwijl een module laadt, mag niet aan `db` komen.** Op Cloudflare is er buiten
  een request geen.
- **Migraties worden twee keer geschreven.** `pnpm db:generate` schrijft `drizzle/` voor libsql en
  `cloudflare/migrations/` voor de gewone SQLite van het object, en een spec houdt ze allebei gelijk
  aan het schema. Een wijziging die SQLite alleen kan maken door een tabel opnieuw op te bouwen,
  vraagt dat je de versie voor het object met de hand schrijft.

**Cron.** `triggers.crons` in `wrangler.jsonc` heeft `0 4 * * *` (de dagelijkse taken) en
`*/15 * * * *` (de stap van de simulaties). De `scheduled()` van de Worker houdt ze uit elkaar met
`controller.cron` en laat het object `POST /_ops/daily` of `POST /_ops/tick` beantwoorden met de
`OPS_TOKEN`, als een request van buiten, zodat de taken erin draaien, met zijn database.

**Gegevens binnenhalen.** Een nieuw object begint leeg. `POST /_ops/import` (met de `OPS_TOKEN`)
vervangt de gegevens van elke tabel door die in een export van een libsql-database, om te beginnen
met de demogegevens of om over te stappen van Turso.

**Deployen.** `pnpm deploy:cloudflare` bouwt met `ADAPTER=cloudflare` en zet de app neer. CI zet
`main` op productie en `develop` op staging zodra de checks en tests slagen. Secrets
(`BETTER_AUTH_SECRET`, `OPS_TOKEN`, `SMTP_URL`) stel je in met `wrangler secret put`; lokaal draait
`pnpm dev:cloudflare` de Worker met wrangler.

<DocsPointer doc="docs/agents/database.md" section="Cloudflare" />
