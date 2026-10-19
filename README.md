# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@1.1.0 create --template minimal --types ts --add vitest="usages:unit,component" tailwindcss="plugins:typography,forms" sveltekit-adapter="adapter:auto" drizzle="database:sqlite+sqlite:libsql" better-auth="demo:password" paraglide="languageTags:en,nl+demo:no" ai-tools="ide:claude-code,opencode,vscode,other+delivery:plugin+tools:mcp,svelte-code-writer,svelte-core-bestpractices,svelte-file-editor+mcpSetup:remote" experimental="features:async,remoteFunctions" --no-install ./
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Demo login

Everything except the login page needs a signed-in user. `pnpm run db:seed` creates three demo
organizations (tenants) and ten demo users, all with the password `fieldworks-demo` (set in
`DEMO_PASSWORD` in `src/lib/server/db/demo.ts`):

| Name              | Email                         | Organizations                                   |
| ----------------- | ----------------------------- | ----------------------------------------------- |
| Anouk de Vries    | `admin@fieldworks.example`    | owner of Fieldworks Noord and Fieldworks Zuid   |
| Pieter Jansen     | `planner@fieldworks.example`  | member of Fieldworks Noord                      |
| Erik Visser       | `engineer@fieldworks.example` | engineer in Fieldworks Noord                    |
| Marloes Hendriks  | `owner@shltr.example`         | owner of SHLTR                                  |
| Jan Weggemans     | `jan@shltr.example`           | member (planner) of SHLTR                       |
| Lev Hoekstra      | `lev@shltr.example`           | engineer in SHLTR                               |
| Marieke Verhoeven | `facilitair@riedel.example`   | customer contact of Riedel B.V. (SHLTR)         |
| Rob Weggemans     | `rob@weggemans.example`       | customer contact of Weggemans Logistiek (SHLTR) |
| Bram de Wit       | `klant@fieldworks.example`    | customer contact of Noord's first customer      |
| Sanne Bakker      | `inkoop@pakhuis7.example`     | customer contact of Pakhuis 7 (SHLTR)           |

The demo data is a Dutch field-service company's, so its names, descriptions and notes are in
Dutch whatever language you use the app in (stored text stays in the language it was written in).

Fieldworks Noord has the optional Service contracts and Invoicing modules; Fieldworks Zuid has
Invoicing only (owners and admins can switch modules on and off under Organization settings).
Switch organizations from the menu at the top of the sidebar. Noord's data includes call-outs on
covered equipment that are overdue, at risk and on track for their contract's response time, as of
when you seeded. Both have invoices for their invoiced orders (Noord's with the contracts' monthly
fees from six months back), paid, sent, overdue and a few voided, plus two drafts each; this month's
contract fees and the completed orders that aren't invoiced yet are left to bill.

Erik is a field engineer: members whose only role is `engineer` (roles are listed in
`src/lib/auth/roles.ts`) use the mobile engineer portal at `/my` instead of the office app, and see only
the orders of the engineer their account is linked to (owners and admins link accounts on an
engineer's edit page). Erik is linked to Noord's first engineer, with work planned today and in the
next days. There they start jobs, log hours, materials and notes, and complete a job with the
customer's signature, which the office sees on the order.

Marieke, Rob and Bram are customers' contacts: members whose only role is `customer` use the
customer portal at `/portal` (mobile-first, fine on a desk) instead of the office app, and see only
their customer's orders, units, sites and locations (all its sites, or some, as the office
invites them). There they report a breakdown (also by scanning a unit's or a location's QR code,
`/q/<token>`), follow their orders (not accepted yet, accepted, planned with the engineer's first
name, done with the work order and its checklists, or rejected with the planner's reason) and see
their equipment, each unit's inspection status and history, and the units needing attention. A
reported breakdown awaits acceptance ("Nieuw (te accepteren)") until someone in the office accepts
it (as a quote, or planned at once) or rejects it, from the order's page; the sidebar's Orders
badge and the dashboard count them. Owners and admins invite and revoke contacts under **Portal
access** on the customer's page. Marieke and Rob have reported breakdowns that await acceptance
(and Marieke one that was accepted and one that was rejected); Bram has none yet.

SHLTR is the client's business (see `docs/plans/shltr-domain.md`): it installs, services and
inspects doors, docks, stairs and airco. Its demo organization has every module, its own equipment
categories (Branddeuren, Sectionaaldeuren, Docklevellers, …), the customers of its mockup with their
sites' contact preferences and access notes (Riedel B.V. in Ede with the units of the mockup's
Apparatuur page, Weggemans Logistiek, Bouwgroep De Vries, Pakhuis 7, Vermeer Logistiek, Van Dijk
Koeltechniek) among a few dozen made-up ones, a year of orders in its mix of work (half of them
breakdowns) and the coming weeks planned, its parts shop's fourteen parts as materials, and
contracts named as it names them ("Full service 24/7", "Onderhoud + keuring", …, in the notes). The
mockup's planning is this week's and the next weeks'. Its people are in SHLTR only; Lev is linked to
its first engineer, like Erik in Noord. The data is in `src/lib/server/db/seed/shltr/`.

These are local demo accounts; don't seed them into a real deployment.

**One-click demo sign-in.** With `DEMO_SIGN_IN=true`, the login page shows "Log in as:" under its
form, with three buttons that sign in to the SHLTR demo at once, without typing: **Planner** as
Jan (SHLTR's planner, a member who manages nothing, to the office dashboard), **Engineer** as Lev
(to the engineer portal) and **Customer** as Marieke (Riedel's contact, a partner with a wallet, to
the customer portal). None is an owner or admin: anyone who opens staging can use them, and
shouldn't be able to change SHLTR's members, invitations or settings (Marloes, its owner, signs in
with her password). They sign in through better-auth with the demo password, like the form, so the
session and its organization (SHLTR) are the same as after typing it. The browser sends only the
role's name; the server maps it to its fixed account and refuses one that isn't there, isn't in
SHLTR or hasn't the role (`src/routes/demo.remote.ts`, `demo-accounts.server.ts`). Once in, the
user menus (the office's, and a button in each portal's header) have **View as** with the same
three roles, the current one checked, to switch without signing out: it signs in as the role
chosen and then ends the old session (its row deleted), in one request, to that role's home; if the
sign-in fails (a demo password was changed), it answers 404 and the old session stays. It's there
only for sessions in SHLTR, so other tenants' users never see it, and the server refuses it (404) to
anyone else. Without the flag the buttons and the switch aren't there and the server answers 404 to
whatever is posted. The flag is set for staging (`wrangler.jsonc`'s `env.staging.vars`) and by the
end-to-end tests' servers; for local development, set `DEMO_SIGN_IN=true` in your `.env` before
`pnpm dev` (`.env.example` has it commented out, so a `.env` copied from it leaves it off). Never
set it in production (`wrangler.jsonc`'s top-level vars, or a Vercel project's environment
variables), where it would let anyone in as these users if they existed.

## Members and invitations

Organization settings → **Members** lists who can sign in to the organization. Owners and admins
invite people by email (with a role), resend or cancel pending invitations, change roles and remove
members; members see the list read-only. Only owners can make someone an owner or change an owner,
nobody changes or removes themselves, and the last owner stays. Customers' contacts aren't on it:
they're invited, listed and revoked under **Portal access** on their customer's page, with the role
`customer`, for all of the customer's sites or some.

The invitation email links to `/invite/<id>`, valid for 7 days. Someone who has an account signs
in and joins; someone new sets their name and password there, which creates an account for exactly
the invited address (there's no other way to sign up).

Mail goes out through `SMTP_URL` if it's set. Without it, it's logged to the server console (so in
development, copy the invitation link from the terminal running `pnpm dev`).

## Testing

```sh
pnpm test          # everything, once
pnpm test:unit     # unit and component tests, in watch mode
pnpm test:e2e      # end-to-end tests only
```

The browser tests use Playwright's own Chromium, which `pnpm install` downloads (or run
`pnpm exec playwright install chromium`).

- **Unit tests** are in `src/tests/unit/`, which mirrors `src/` (a module's in
  `src/modules/<id>/tests/unit/`, mirroring the module): `*.spec.ts` runs in Node,
  `*.svelte.spec.ts` in the browser.
- **End-to-end tests** are in `src/tests/e2e/` (a module's in `src/modules/<id>/tests/e2e/`). They sign in and click through the app like a user, then
  check the database. Each run builds the app, seeds a fresh database in a temporary folder and
  starts a production server per test worker, each with its own copy of the database
  (`src/tests/e2e/global-setup.ts`). The test files run in parallel across them, and none of it touches
  `local.db` or a dev server you have running (which reloads once when the build starts).
  `src/tests/e2e/app.ts` has the helpers: a signed-in page (`useApp`), switching organizations, submitting
  remote forms, reading the database, and reading the mail the app sent (each server writes it to
  a file in the temporary folder, `MAIL_OUTBOX`, instead of sending it). `E2E_DEV=1 pnpm test:e2e` runs them against a single dev
  server instead: slower, but with Svelte's dev-only warnings. `pnpm test` runs a file that fails
  once more, afresh, before calling the run failed (`scripts/test.ts`).
- **At another date**: `TEST_NOW=2027-01-01 pnpm test --project e2e <files>` runs the tests, the
  seed and the app as if it were that day (or `TEST_NOW=2027-01-01T07:45`, a time, or an instant
  with `Z`), in the e2e and server projects. The **Dates** workflow runs the e2e tests and server
  specs weekly at the dates that tend to break them (a weekend, a month's end, 1 January, a clock
  change), and by hand at the dates you give (Actions → Dates → Run workflow). See "Testing at
  another date" in `docs/agents/tests.md`.

## Deploying

The app deploys to [Vercel](https://vercel.com) or to Cloudflare Workers. `pnpm build` builds with
[`adapter-auto`](https://svelte.dev/docs/kit/adapter-auto), which uses the adapter of the platform
it builds on: Vercel's in a Vercel build (installing it then). `ADAPTER=cloudflare` builds with
`adapter-cloudflare` instead, for Cloudflare (see "On Cloudflare"). Anywhere else, `pnpm build`
makes no server to deploy; `pnpm preview` tries the build locally.

Environment variables (see `.env.example` and `src/env.ts`). On Vercel they're the project's
environment variables; on Cloudflare `wrangler.jsonc`'s `vars`, or secrets
(`wrangler secret put`); locally `.env` (`.dev.vars` for `pnpm dev:cloudflare`).

| Variable              | Required      | What for                                                                                             |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | on Vercel     | The database: a Turso database (`libsql://<name>.turso.io`), or a file locally; unused on Cloudflare |
| `DATABASE_AUTH_TOKEN` | with Turso    | The Turso database's access token                                                                    |
| `ORIGIN`              | yes           | The public URL, e.g. `https://fieldworks.example.com`: sign-in and links in emails                   |
| `VERCEL_BRANCH_URL`   | no            | Set by Vercel: without `ORIGIN`, the origin is `https://` and this domain                            |
| `BETTER_AUTH_SECRET`  | yes           | Signs sessions; 32+ random characters, e.g. from `openssl rand -base64 32`                           |
| `SMTP_URL`            | no            | Sends mail, e.g. `smtps://user:password@smtp.example.com:465`; otherwise it's logged                 |
| `MAIL_FROM`           | no            | The sender, e.g. `Fieldworks <noreply@example.com>`                                                  |
| `CRON_SECRET`         | on Vercel     | Lets a cron start the daily jobs (see "Daily jobs"); Vercel Cron sends it itself                     |
| `OPS_TOKEN`           | on Cloudflare | Also starts the daily jobs; on Cloudflare it also guards `/_ops/import`                              |
| `DEMO_SIGN_IN`        | no            | `true` for the login page's demo buttons (see "Demo login"); never in production                     |
| `BUG_REPORT_EMAIL`    | no            | Gets a mail for each bug report (the headers' record button); otherwise it's logged                  |
| `DEVELOPER_EMAILS`    | no            | Comma-separated: the accounts that may open the bug reports at `/ops/bug-reports`                    |
| `BUG_REPORTS_DIR`     | no            | Where bug reports' recordings go (`.bug-reports`); on Cloudflare the `BUG_REPORTS` R2 bucket         |

### On Vercel

Vercel builds the app from the repository itself (`pnpm install`, whose `prepare` skips
Playwright's browser there, and `pnpm build`), and runs it as functions, with no disk that lasts:
the database is a Turso database. Set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BETTER_AUTH_SECRET`
and `CRON_SECRET` in the project's environment variables, and `ORIGIN` to the production domain
(without it, each deployment's origin is its branch's domain, `VERCEL_BRANCH_URL`).

The build doesn't migrate the database. Create its tables, and update them with every new version,
from a checkout:

```sh
DATABASE_URL=libsql://<name>.turso.io DATABASE_AUTH_TOKEN=<token> pnpm db:migrate
```

It applies the migrations in `drizzle/` that the database doesn't have yet (and does nothing if
it's up to date). Then create the first organization and its owner, from the same checkout and
with the same `DATABASE_URL` and `DATABASE_AUTH_TOKEN` (on Cloudflare, make it in a local file and
import that: see "On Cloudflare"):

```sh
pnpm run org:create -- --org "Acme Service" --slug acme \
  --owner-email ada@acme.example --owner-name "Ada Lovelace" --modules contracts,invoices,materials,schedule
```

It prints the owner's email address and a generated password, once: pass them on safely. `--slug`
is lower-case letters, digits and dashes; `--modules` lists the optional modules to switch on
(`contracts`, `invoices`, `maintenance`, `materials`, `schedule`, each with what it requires; a new organization has only the
ones listed, and owners can switch modules on and off later); `--help` lists the options. It
refuses a slug or an email address that's taken, so it can also add more organizations later, each
with a new owner. After that, the owner invites everyone else (see "Members and invitations").

Don't run `pnpm db:seed` or `db:reset` against the database: the seed deletes every organization
and its data, and puts demo data and demo users in their place.

### Daily jobs

Once a day the app does some work by itself, organization by organization: for now, the
maintenance module turns the plans that are due into orders, for organizations that switched that
on (Maintenance plans → Settings). A cron starts it with `POST /_ops/daily` (or `GET`, as Vercel
Cron sends), with `Authorization: Bearer <CRON_SECRET or OPS_TOKEN>`; running it more than once a
day does no harm. Without either variable set, nothing can start it.

- **Vercel**: `vercel.json` schedules it at 04:00 UTC; set `CRON_SECRET` in the project's
  environment variables, and Vercel Cron sends it.
- **Cloudflare**: the Worker's Cron Trigger (`triggers.crons` in `wrangler.jsonc`) starts it inside
  the Durable Object, with `OPS_TOKEN`.
- **By hand** (or from a cron of your own): `pnpm jobs:daily` posts to `ORIGIN` (or the URL it's
  given) with the token from `.env`.

The run's day is the server's (UTC on Vercel and Cloudflare), and its mail (customer reminders) is
in English: the cron's request has no user's time zone or language.

### The demo's simulations

A demo organization can have a module whose real feed isn't connected yet simulated (SHLTR's
Salvo docks and P1 meters; the seed gives it the rows in `simulation`, real tenants never have
one). While it runs, the module makes its data up over each interval of real time, through its own
ingest path. `POST /_ops/tick` (or `GET`), with the same token as the daily jobs, moves every
running simulation on to now; the bar on the module's page (Start/Pause, speed, reset, for
managers) does it every 15 seconds while the page is open, so a cron is only needed to keep it
going while no one looks. A tick covers up to 20 minutes (`tickCap`), so a cron every 15 minutes
leaves no gap, and the modules make up what's missing since their latest data.

- **Cloudflare**: the Worker's Cron Trigger every 15 minutes (`*/15 * * * *`, next to the daily
  one) does it, asking nothing of the app while no simulation runs.
- **Vercel**: `vercel.json` schedules the daily jobs only, so the simulations move while the page
  is open; a cron elsewhere posting to `/_ops/tick` every 15 minutes, with `CRON_SECRET`, keeps them
  going.

### On Cloudflare

The app also runs on Cloudflare Workers, with its database in a
[Durable Object](https://developers.cloudflare.com/durable-objects/): one object for the whole
app, whose SQLite is in the same process as the code, so a query is a function call rather than a
round trip. `cloudflare/entry.ts` is the Worker; it wraps the worker that SvelteKit's
`adapter-cloudflare` writes (`ADAPTER=cloudflare`) and runs each request inside the object, which
migrates its database itself when it starts (`cloudflare/migrations/`).

```sh
pnpm exec wrangler login                    # once
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put OPS_TOKEN      # allows importing data (see below), the daily jobs and the simulations' tick
pnpm exec wrangler r2 bucket create fieldworks-bug-reports   # once: the bug reports' recordings
pnpm deploy:cloudflare                      # builds with ADAPTER=cloudflare and deploys
```

Set `ORIGIN` in `wrangler.jsonc` to the Worker's URL (or your domain). `DATABASE_URL` isn't used
there. To try it locally in Cloudflare's runtime: copy `.dev.vars.example` to `.dev.vars` and run
`pnpm dev:cloudflare` (wrangler keeps the object's data in `.wrangler/`).

The Worker has two Cron Triggers (`triggers.crons`, in the top level and in `env.staging`):
`0 4 * * *` runs the daily jobs, `*/15 * * * *` ticks the demo's simulations (see "The demo's
simulations"); `scheduled()` tells them apart by `controller.cron`, and has the object answer
`/_ops/daily` or `/_ops/tick` with the `OPS_TOKEN`.

A new object starts empty. Its data comes from a libsql database, through
`POST /_ops/import`, which replaces the data of every table in the export: to start, make the
first organization (or the demo data) in a local file and import that; to move from Turso, export
Turso's.

```sh
DATABASE_URL=file:start.db pnpm db:migrate
DATABASE_URL=file:start.db pnpm run org:create -- --org "Acme Service" --slug acme --owner-email ada@acme.example --owner-name "Ada Lovelace"
node cloudflare/export-database.ts file:start.db > export.json
curl -X POST https://<worker>/_ops/import -H "Authorization: Bearer $OPS_TOKEN" --data-binary @export.json
```

CI deploys `main` to the Worker above, and every push to `develop` to staging,
`fieldworks-staging` (`wrangler.jsonc`'s `staging` environment, https://fieldworks-staging.devign.workers.dev),
once the checks and tests pass. Staging has a database of its own, which CI fills with the demo
data (see "Demo login") on every deploy, so what's done there doesn't last; its login page has the
one-click demo sign-in (`DEMO_SIGN_IN` in its vars), production's hasn't. Its auth secret is made
on the first deploy; its ops token anew on every deploy, used only by CI.

Cloudflare keeps 30 days of the object's history (point-in-time recovery). Mail: `SMTP_URL` sends
through nodemailer, which is untested on Workers; without it, mail is logged
(`wrangler tail`).

#### Reading the logs

Workers Logs keeps what the Worker logs (`observability` in `wrangler.jsonc`, both environments),
and indexes the fields of a line that is a JSON object. The app logs two kinds
(`src/lib/server/logs/`), each with the app's `version`:

- `type = "error"`: an error the server caught (`side = "server"`, from `handleError` in
  `src/hooks.server.ts`: unknown errors and 5xx, not refusals such as a 404) or one a browser
  reported (`side = "client"`, `reportClientError`, with its `source`: `hook`,
  `boundary:<name>`, `error` or `unhandledrejection`). Both carry the `errorId` the user was shown
  ("Quote this code when you report it"), `message`, `stack`, `route`, the path (`url` on the
  server, `path` from the browser, without the query), the `remote` function (server), and the
  `userId` and `organizationId` of the session. Browser stacks are minified.
- `type = "timing"` (only with `TIMING_LOGS=1`, which staging has): one line per request with
  `route`, `url`, `remote`, `method`, `status`, `ms` (wall time), `transactions.count` and
  `transactions.ms` (the database's transactions: on Cloudflare each holds every other request of
  the Durable Object until it's done) and `queries` (statements); and one per live query when its
  stream closes (`live = true`, `ms` open). A Worker's clocks only move at I/O, so `ms` there is a
  lower bound; the counts are exact.

In the dashboard: Workers & Pages → the Worker → Observability → Events, with the query builder:

- **An error someone quotes**: filter `errorId` = the id. A client line and the server's own share
  it when the error came from the server.
- **The slowest remote functions**: filter `type` = `timing` and `remote` exists; group by
  `remote`; visualise P95 (or max) of `ms`, or of `transactions.ms`.
- **Requests that held up others**: filter `type` = `timing` and `transactions.count` > 0; sort by
  `transactions.ms`. Many `queries` in one request is a lead too.
- **Errors by kind**: filter `type` = `error`; group by `side`, `route` or `remote`.

`wrangler tail --format json` (add `--env staging`) shows the same lines live. Cloudflare's own
invocation logs and traces (each request, with its CPU and wall time, and the object's storage
calls) are under the same Observability tab.
