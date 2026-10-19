# Error handling and telemetry

Wishes 2.1, 2.2 and 7 of 19 October 2026, after grilling (Q2, Q4–Q7). One plan, because both
halves touch the hooks, the layouts and the error's report.

## Problem

- **A crashing page leaves the shell.** Only four `<svelte:boundary>`s exist: one per extension
  slot contribution (`src/lib/extensions/extension-slot.svelte:84`, the only one with `onerror`),
  two empty ones in the data table (`views-menu.svelte`, the hidden width cells), and one without a
  `failed` snippet in `activity-card.svelte`. Anything else that throws while rendering ends on a
  route's `+error.svelte` (`src/routes/error-view.svelte`, and copies of it in `(field)` and
  `(customer)`). That page only shows `message (status)` and a link home, and it can't reset what
  failed.
- **Some failures are transient.** The one seen most is a top-level `await` in a component that
  reads as `undefined` for a moment ("Cannot read properties of undefined"). It has had two causes
  before: fork-preloaded async deriveds reading `UNINITIALIZED` (patched in
  `patches/svelte@5.57.1.patch`, commit `eedb92d7`), and signing out mid-navigation (`d3d3c152`).
  Remounting the component almost always works, but today the user gets the error page instead.
- **Errors are invisible to the developer.** No `handleError` hook exists (`src/hooks.client.ts`,
  `src/hooks.server.ts`). A boundary's error often doesn't reach the console, and an error in a
  user's browser never reaches the server.
- **Telemetry is half on.** `wrangler.jsonc` enables `observability` at the top level only. The
  `staging` env doesn't inherit it. There are no traces, structured logs or error ids, and no
  numbers on how busy the one Durable Object is (wish 7, folded in here; see "Timing").

## Decisions (grilling)

| #     | Decision                                                                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q2    | On **any** error except an HTTP error, the boundary resets once by itself with a toast. If it fails again within 30 s, it shows the failed snippet with Try again and Reload. It doesn't match error messages: Chrome says "Cannot read properties of undefined", Firefox "can't access property", Safari "undefined is not an object". |
| Q6    | One shared `<ErrorBoundary>` wraps the page content in the `(app)`, `(field)` and `(customer)` layouts, and each extension slot contribution. The `+error` pages stay for load and HTTP errors, with Reload and Back buttons as well as the home link.                                                                                  |
| Q7    | Errors from the browser go to our own server, which logs them as structured JSON into Cloudflare Workers Logs. No Sentry. Observability also goes on in staging, and Kit 3's tracing too if it works on Workers.                                                                                                                        |
| Q4/Q5 | No in-memory cache: on Cloudflare each query is an in-process SQLite call inside the Durable Object. Instead this plan measures the object's time per request and per remote function, so a real hot spot shows up in data. The hover cards ([hover-cards.md](hover-cards.md)) are the first feature to read those numbers.             |

## Design

New generic code in `src/lib/errors/` (and `src/lib/server/errors/` for the server side), unless
`docs/agents/structure.md` points somewhere better.

### What kind of error it is

`classify(error): ErrorKind`, a pure function with a unit spec:

| Kind      | Recognised by                                                                                                                                       | Shown                                                                                    | Auto-reset  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| `http`    | Kit's `HttpError` (a remote function's `error(404)`, `error(403)`), keeping the status                                                              | 404 "This … doesn't exist (anymore)", 403 "You don't have access", other 4xx its message | no          |
| `session` | status 401, or the session gone                                                                                                                     | "You've been signed out", with a Sign in button                                          | no          |
| `offline` | a failed `fetch` (TypeError) while `navigator.onLine` is false                                                                                      | "You're offline", and retries by itself on the `online` event                            | on `online` |
| `updated` | a failed dynamic import ("Failed to fetch dynamically imported module", "Importing a module script failed"), or `updated.current` from `$app/state` | "The app was updated", with Reload                                                       | no          |
| `unknown` | everything else                                                                                                                                     | "Something went wrong" and the error id                                                  | once / 30 s |

The messages are Paraglide messages in `en` and `nl` (read `docs/agents/i18n.md`).

### `<ErrorBoundary>`

`src/lib/errors/error-boundary.svelte`. Its props are `children`, `variant: "page" | "part"`, and
an optional `failed` snippet for a part's own look. It does this:

- **`onerror(error, reset)`:** always `console.error(error)` and `report(error)` (below). Then, by
  kind:
  - `unknown`, with no auto-reset of this boundary in the last 30 s: `toast` (a short "Something
    went wrong, reloaded this part") and `reset()`.
  - Otherwise, show the failed snippet.

  The 30 s window is per boundary instance and pathname, so navigating to another page starts a
  new window. The window is a module constant, and the unit test uses fake timers.

- **The failed snippet, `page` variant:** the kind's message, the error id (small, selectable, "Quote
  this code when reporting it"), and the buttons Try again (`reset()`), Reload
  (`location.reload()`) and the shell's home link. The home link is the one that layout passes in:
  the dashboard, `/my` or `/portal`.
- **`part` variant:** the extension slot's current card (`data-extension-failed`, which the e2e
  tests read), with Try again. The slot's `attempts`/`{#key}` remount becomes the boundary's
  `reset()`, if that turns out to be equivalent. Verify that a contribution whose module import
  failed (`fail(error)`) still recovers on Try again.
- **Layouts:** wrap `{@render children()}` in `(app)/+layout.svelte`, `(field)/+layout.svelte` and
  `(customer)/+layout.svelte`. Leave `NavigationSkeleton` outside it. Check in the browser whether an
  `HttpError` thrown by an awaited remote query inside a page reaches this boundary or the route's
  `+error` page. Either way, it must show the `http` message without an auto-reset.
- `activity-card.svelte` gets a `part` boundary, so a broken activity card doesn't take the record
  page down.

### `+error` pages

`(field)/+error.svelte` and `(customer)/+error.svelte` use `error-view.svelte` with a `home` prop
instead of copying it. The view shows the kind's message, by status (404, 403, 401, 5xx), the error
id from `page.error.errorId`, and the buttons Reload, Back (`history.back()`, only when there's
history) and the home link.

### Reporting and logs

- **`App.Error`** (`src/app.d.ts`) gains `errorId: string`.
- **`handleError` in `hooks.server.ts`:** makes an id (`crypto.randomUUID()`), and logs one
  structured line with `console.error(JSON.stringify({...}))`. The fields are `type: "error"`,
  `side: "server"`, `errorId`, `status`, `message`, `stack`, `route` (`event.route.id`), `url`
  (path only, no query), `remote` (the remote function's name, if any), `userId`, `organizationId`
  and `version`. It returns `{ message, errorId }`, and the message stays generic for a 500. Workers
  Logs indexes a JSON line's fields, so `errorId = "…"` finds it.
- **`handleError` in `hooks.client.ts`:** `console.error(error)` plus `report()`.
- **`report(error, context)`** (client): one `reportClientError` remote **command** from
  `forAnyone`, since a signed-out page can fail too. It sends `errorId`, `kind`, `message`,
  `stack`, `route`, `path`, `version`, `userAgent`, and where it came from (`boundary:page`,
  `boundary:part:<slot id>`, `hook`, `unhandledrejection`). The server adds the user and tenant from
  the session if there is one, and logs a line like the server's with `side: "client"`. Limits:
  a valibot schema with string lengths (a stack ≤ 8 kB), at most 20 reports per session/IP per
  minute (an in-memory counter is enough with one object), and the same `errorId` only once. A
  report that fails to send is dropped quietly, never reported again.
- **`window` `error` and `unhandledrejection`** listeners (in `hooks.client.ts`'s `init`) report
  too, deduplicated by the error object.
- **Minified stacks.** Client stacks in production are minified. Making them readable (keeping
  hidden source maps and a script that maps a stack) is a follow-up, not this plan.

### Cloudflare

- `wrangler.jsonc`: repeat `observability` in `env.staging`. Turn on logs (`invocation_logs`) and
  traces where Workers support them; check the current wrangler schema in `node_modules`. Leave
  `head_sampling_rate` at 1 for now.
- **Kit's tracing** (`kit.tracing.server`, top-level in Kit 3, see
  `node_modules/@sveltejs/kit/types/index.d.ts`) with `src/instrumentation.server.ts`. Find out
  whether adapter-cloudflare 8 loads `instrumentation.server.ts`, and whether an OpenTelemetry SDK
  runs in a Worker and exports to Cloudflare's traces or an OTLP endpoint. Write down what you found
  in this plan. If it works with little code, turn it on. If not, skip it: the timing below already
  covers what wish 7 needs.

### Timing (wish 7)

The questions are where the Durable Object's time goes, and whether requests wait on each other. A
tracing span would answer that, and so does a log line:

- **Per request** (in `handle`): one `type: "timing"` line with `route`, `remote` (function name),
  `ms` (wall time), `transactions` (count and total ms, from a counter around
  `storage.transaction()` in `src/lib/server/db/durable.ts`) and `queries` (count, if the drizzle
  driver gives a cheap hook).
- Live streams (`query.live`) get one line when they close, with their open duration.
- Turn this on with an env var (`TIMING_LOGS=1`). It's on in staging and off in production unless
  turned on, so the log volume stays known.
- A short "Reading the logs" section in README.md, "On Cloudflare": how to find an error by id, the
  slowest remote functions, and requests that waited on a transaction, in the Workers Logs query
  builder.

## Steps

1. `classify()`, the messages, and the unit spec.
2. `App.Error`, both `handleError`s, `reportClientError` with its server spec (it validates, keeps
   to its limits, works signed out, and adds the tenant only from the session).
3. `<ErrorBoundary>` and its component spec. Cases: auto-reset once, failed the second time within
   30 s, auto-resets again after 30 s, never auto-resets an `http` error, retries an `offline` one on
   `online`.
4. The layouts, the extension slot and the activity card. The `+error` pages through one view.
5. wrangler (staging), the timing lines, and the README section. Then tracing, if it works.

## Tests

- **Unit:** `classify()`, the throttle.
- **Component:** `<ErrorBoundary>` (see step 3), following docs/agents/tests.md's harnesses.
- **Server spec:** `reportClientError`.
- **e2e:** a page that crashes once recovers with a toast. A page that keeps crashing shows the
  failed snippet with Try again and Reload, inside the shell (the sidebar is still there). A
  module's part that crashes shows its card while the page around it works. These need a way to
  make a component throw on purpose in dev and e2e builds only. Check docs/agents/tests.md for how
  the app's other test switches work, and never ship one to production.
- The existing extension slot e2e tests still pass.

## Out of scope

Sentry or any third party, alerting on errors, symbolicating client stacks, and fixing the
`undefined` race itself. The logs from this plan are meant to catch it in the act. When they do,
it's a bug for `docs/upstream-bugs/` or a fix of its own.
