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

Everything except the login page needs a signed-in user. `pnpm run db:seed` creates two demo
organizations (tenants) and three demo users, all with the password `fieldworks-demo` (set in
`DEMO_PASSWORD` in `src/lib/server/db/demo.ts`):

| Name           | Email                         | Organizations                                 |
| -------------- | ----------------------------- | --------------------------------------------- |
| Anouk de Vries | `admin@fieldworks.example`    | owner of Fieldworks Noord and Fieldworks Zuid |
| Pieter Jansen  | `planner@fieldworks.example`  | member of Fieldworks Noord                    |
| Erik Visser    | `engineer@fieldworks.example` | engineer in Fieldworks Noord                  |

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

These are local demo accounts; don't seed them into a real deployment.

## Members and invitations

Organization settings → **Members** lists who can sign in to the organization. Owners and admins
invite people by email (with a role), resend or cancel pending invitations, change roles and remove
members; members see the list read-only. Only owners can make someone an owner or change an owner,
nobody changes or removes themselves, and the last owner stays.

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

## Deploying

The app runs as a Node server ([`adapter-node`](https://svelte.dev/docs/kit/adapter-node)) next to
its SQLite database file.

```sh
pnpm install
pnpm build                                  # the server, in build/
DATABASE_URL=file:/var/lib/fieldworks/fieldworks.db pnpm db:migrate   # create or update the tables
node --env-file=.env build                  # listens on port 3000 (PORT, HOST to change)
```

Run `pnpm db:migrate` with every new version, before starting it: it applies the migrations in
`drizzle/` that the database doesn't have yet (and does nothing if it's up to date).

To run it, a server needs `build/`, `package.json` and the production dependencies (`pnpm install
--prod`: the database driver, `@libsql/client`, which has native code and isn't bundled).
To try the build locally, use `pnpm preview`: `node build` expects HTTPS (see below), so over plain
HTTP it refuses form submissions, including signing in.

Environment variables (see `.env.example` and `src/env.ts`):

| Variable              | Required | What for                                                                                 |
| --------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | The database, e.g. `file:/var/lib/fieldworks/fieldworks.db`: a file on a persistent disk |
| `DATABASE_AUTH_TOKEN` | no       | The access token of a Turso database (`DATABASE_URL=libsql://<name>.turso.io`)           |
| `ORIGIN`              | yes      | The public URL, e.g. `https://fieldworks.example.com`: sign-in and links in emails       |
| `VERCEL_BRANCH_URL`   | no       | Set by Vercel: without `ORIGIN`, the origin is `https://` and this domain                |
| `BETTER_AUTH_SECRET`  | yes      | Signs sessions; 32+ random characters, e.g. from `openssl rand -base64 32`               |
| `SMTP_URL`            | no       | Sends mail, e.g. `smtps://user:password@smtp.example.com:465`; otherwise it's logged     |
| `MAIL_FROM`           | no       | The sender, e.g. `Fieldworks <noreply@example.com>`                                      |

The server assumes it's reached over HTTPS, from a reverse proxy that terminates TLS and passes on
the `Host` header (form submissions from any other origin are refused). If the proxy sets
`X-Forwarded-Host` instead, also set `HOST_HEADER=x-forwarded-host` and
`PROTOCOL_HEADER=x-forwarded-proto`; see the adapter's docs for these and the other options.

Then create the first organization and its owner, from the same checkout and with the same
`DATABASE_URL`:

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

Back up the database file (and its `-wal` file, if any) like any other data. Don't run
`pnpm db:seed` or `db:reset` against it: the seed deletes every organization and its data, and puts
demo data and demo users in their place.

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
pnpm exec wrangler secret put OPS_TOKEN      # allows importing data, see below
pnpm deploy:cloudflare                      # builds with ADAPTER=cloudflare and deploys
```

Set `ORIGIN` in `wrangler.jsonc` to the Worker's URL (or your domain). `DATABASE_URL` isn't used
there. To try it locally in Cloudflare's runtime: copy `.dev.vars.example` to `.dev.vars` and run
`pnpm dev:cloudflare` (wrangler keeps the object's data in `.wrangler/`).

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

Cloudflare keeps 30 days of the object's history (point-in-time recovery). Mail: `SMTP_URL` sends
through nodemailer, which is untested on Workers; without it, mail is logged
(`wrangler tail`).
