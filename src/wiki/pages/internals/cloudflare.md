---
title: Cloudflare and the Durable Object
summary: The app runs as a Cloudflare Worker whose one Durable Object holds the whole database, so a query is a function call.
section: internals
order: 5
status: built
covers: []
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

Fieldworks can run in two places. On a plain Node server it uses a libsql database (a local file,
or Turso). On **Cloudflare Workers** it runs at the edge with its database inside the same process,
which is how the production and staging deployments run.

What that means for someone using the app:

- **It is quick.** There is no network hop between the code and the data, so a query is a
  function call rather than a round trip to a database server.
- **Daily jobs run themselves.** At 04:00 UTC a cron trigger starts the daily jobs, such as the
  maintenance plans that become orders. Every 15 minutes another ticks the demo's simulations, so
  the docks and energy modules have live-looking data.
- **Recordings and mail have a home.** Bug-report recordings go to an R2 bucket, invitations and
  reminders go out through SMTP.
- **A safety net.** Cloudflare keeps 30 days of the database's history, so it can be restored to a
  moment in time.
- **Staging is real but disposable.** Every push to `develop` deploys a Worker of its own, with its
  own database, which is filled with the demo data again on every deploy. Its login page has the
  one-click demo sign-in; production's has not.

<Diagram viewBox="0 0 440 180" label="A request reaches the Worker, which sends it to the one Durable Object. Inside it SvelteKit and the SQLite database run together. Cron triggers also call the object. Bug-report recordings go to an R2 bucket.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="60" width="86" height="44" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="47" y="86" fill="var(--foreground)">Worker</text>
		<rect x="140" y="10" width="190" height="130" rx="10" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="235" y="30" font-weight="600" fill="var(--foreground)">Durable Object</text>
		<text x="235" y="46" fill="var(--muted-foreground)">AppDatabase, one for all</text>
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

**One object runs everything.** The Worker (`wrangler.jsonc`, `main: cloudflare/entry.ts`) sends every
request to the app's single Durable Object, `AppDatabase`. Static files never reach it, because
Cloudflare serves them first. The object migrates its SQLite database when it starts
(`blockConcurrencyWhile`), then answers each request by running SvelteKit inside itself, with its
storage handed along in an `AsyncLocalStorage` (`durableRequests`). `db` finds it there, so the app's
code is the same on Node and on Cloudflare. See <SourceLink path="cloudflare/entry.ts" line={49}>AppDatabase</SourceLink> and <SourceLink path="src/lib/server/db/durable.ts" line={53}>drizzleDurable</SourceLink>.

What follows from that:

- **Transactions hold every other request.** In the object they run in `storage.transaction()`,
  which takes turns with all other requests (as `drizzleQueued` makes libsql do). So I/O such as
  mail or `fetch` stays out of a transaction, or the whole app waits for it. Nested transactions
  are part of the outer one; there are no savepoints.
- **A statement binds at most 100 values.** That is the Durable Object's limit (libsql takes 32,766),
  and `db` enforces it everywhere, in tests too. Lists of values go through `inList()` and
  `insertRows()`.
- **Live changes are in memory.** `announceChange()` reaches the live queries of the object, which
  serves every request, so [live updates](/wiki/across/live-updates) work without a broker. A Node
  deployment with several instances would need one.
- **Code that runs while a module loads mustn't touch `db`.** On Cloudflare there is none outside a
  request.
- **Migrations are written twice.** `pnpm db:generate` writes `drizzle/` for libsql and
  `cloudflare/migrations/` for the object's plain SQLite, and a spec holds both to the schema. A
  change SQLite can only make by rebuilding a table needs the object's copy written by hand.

**Cron.** `triggers.crons` in `wrangler.jsonc` has `0 4 * * *` (the daily jobs) and `*/15 * * * *`
(the simulations' tick). The Worker's `scheduled()` tells them apart by `controller.cron` and has
the object answer `POST /_ops/daily` or `POST /_ops/tick` with the `OPS_TOKEN`, like a request from
outside, so the jobs run inside it with its database.

**Moving data in.** A new object starts empty. `POST /_ops/import` (with the `OPS_TOKEN`) replaces
the data of every table in an export of a libsql database, to start with the demo data or to move
from Turso.

**Deploying.** `pnpm deploy:cloudflare` builds with `ADAPTER=cloudflare` and deploys. CI deploys
`main` to production and `develop` to staging once the checks and tests pass. Secrets
(`BETTER_AUTH_SECRET`, `OPS_TOKEN`, `SMTP_URL`) are set with `wrangler secret put`; locally
`pnpm dev:cloudflare` runs the Worker with wrangler.

<DocsPointer doc="docs/agents/database.md" section="Cloudflare" />
