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
organizations (tenants) and two demo users, both with the password `fieldworks-demo` (set in
`DEMO_PASSWORD` in `src/lib/server/db/demo.ts`):

| Name        | Email                        | Organizations                                  |
| ----------- | ---------------------------- | ---------------------------------------------- |
| Avery Admin | `admin@fieldworks.example`   | owner of Fieldworks North and Fieldworks South |
| Pat Planner | `planner@fieldworks.example` | member of Fieldworks North                     |

Fieldworks North has the optional Service contracts module; Fieldworks South doesn't (owners and
admins can switch modules on and off under Organization settings). Switch organizations from the
menu at the top of the sidebar.

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

- **Unit tests** sit next to the code they test: `*.spec.ts` runs in Node, `*.svelte.spec.ts` in
  the browser.
- **End-to-end tests** are in `e2e/`. They sign in and click through the app like a user, then
  check the database. Each run builds the app, seeds a fresh database in a temporary folder and
  starts a production server per test worker, each with its own copy of the database
  (`e2e/global-setup.ts`). The test files run in parallel across them, and none of it touches
  `local.db` or a dev server you have running (which reloads once when the build starts).
  `e2e/app.ts` has the helpers: a signed-in page (`useApp`), switching organizations, submitting
  remote forms, reading the database, and reading the mail the app sent (each server writes it to
  a file in the temporary folder, `MAIL_OUTBOX`, instead of sending it). `E2E_DEV=1 pnpm test:e2e` runs them against a single dev
  server instead: slower, but with Svelte's dev-only warnings.

## Deploying

The app runs as a Node server ([`adapter-node`](https://svelte.dev/docs/kit/adapter-node)) next to
its SQLite database file.

```sh
pnpm install
pnpm build                                  # the server, in build/
DATABASE_URL=file:/var/lib/fieldworks/fieldworks.db pnpm db:push   # create or update the tables
node --env-file=.env build                  # listens on port 3000 (PORT, HOST to change)
```

To run it, a server needs `build/`, `package.json` and the production dependencies (`pnpm install
--prod`: the database driver, `@libsql/client`, which has native code and isn't bundled).
To try the build locally, use `pnpm preview`: `node build` expects HTTPS (see below), so over plain
HTTP it refuses form submissions, including signing in.

Environment variables (see `.env.example` and `src/env.ts`):

| Variable             | Required | What for                                                                                 |
| -------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | yes      | The database, e.g. `file:/var/lib/fieldworks/fieldworks.db`: a file on a persistent disk |
| `ORIGIN`             | yes      | The public URL, e.g. `https://fieldworks.example.com`: sign-in and links in emails       |
| `BETTER_AUTH_SECRET` | yes      | Signs sessions; 32+ random characters, e.g. from `openssl rand -base64 32`               |
| `SMTP_URL`           | no       | Sends mail, e.g. `smtps://user:password@smtp.example.com:465`; otherwise it's logged     |
| `MAIL_FROM`          | no       | The sender, e.g. `Fieldworks <noreply@example.com>`                                      |

The server assumes it's reached over HTTPS, from a reverse proxy that terminates TLS and passes on
the `Host` header (form submissions from any other origin are refused). If the proxy sets
`X-Forwarded-Host` instead, also set `HOST_HEADER=x-forwarded-host` and
`PROTOCOL_HEADER=x-forwarded-proto`; see the adapter's docs for these and the other options.

Back up the database file (and its `-wal` file, if any) like any other data. Don't run
`pnpm db:seed` or `db:reset` against it: the seed deletes every organization and its data, and puts
demo data and demo users in their place. The first organization and its owner are created by hand
for now; after that, the owner invites everyone else.
