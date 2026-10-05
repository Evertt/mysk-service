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
  remote forms, and reading the database. `E2E_DEV=1 pnpm test:e2e` runs them against a single dev
  server instead: slower, but with Svelte's dev-only warnings.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
