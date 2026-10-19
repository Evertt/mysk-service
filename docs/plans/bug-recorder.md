# Bug recorder

Wish 2.3 of 19 October 2026, after grilling (Q3, Q8, Q9). A user records themselves running into a
bug, and the developer replays it.

## Problem

When a user says something went wrong, the developer has a sentence and maybe a screenshot. They
don't have the clicks before it, what the page showed, or the console. Bugs that happen only
sometimes, like the `undefined` race in [error-handling.md](error-handling.md), are the hardest to
reproduce from that.

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q3  | Record with **rrweb**: DOM snapshots and changes, mouse movement, clicks, scrolls and input, replayable. Our own extras go with it (below). Lazy-loaded when recording starts.                                                  |
| Q8  | The recording goes to an **R2 bucket** (a folder on Node), with a row in a `bug_report` table. The developer gets an **email** linking to an in-app **replay page**, which only developer emails listed in an env var can open. |
| Q9  | The record button is in the **office app's top bar** (`src/routes/(app)/app-header.svelte`) and the **engineer portal's header** (`src/routes/(field)/+layout.svelte`). Not in the customer portal.                             |
| —   | Defaults agreed with the summary: an optional note when stopping, a 10-minute cap, only password fields masked, and a visible notice that the screen is being recorded.                                                         |

## Design

### The button

- **Idle:** a quiet icon button (a bug icon), with the tooltip "Report a problem".
- **Click:** recording starts. The button turns into a red pulsing dot with the elapsed time. A
  toast says "Recording your screen: click the red dot when you're done". Recording survives
  client-side navigation, since it lives in the layout. A full reload ends it: the part recorded so
  far is kept in `sessionStorage` (if it fits) and offered for sending after the reload.
- **Click again, or at 10 minutes:** recording stops and a popover opens with an optional note
  ("What went wrong?") and the buttons Send and Discard. Send uploads and closes. The toast says
  "Thanks, your report was sent" or the error.
- The component and its state go in `src/lib/components/bug-report/` (or wherever
  `docs/agents/structure.md` points). Both headers render the same component.

### What's recorded

- **rrweb**: use `@rrweb/record` if it's the smaller package with the same output. Do the
  dependency vetting the `supermatt:dependency-vetting` skill describes before adding it.
  - Masking: `maskInputOptions: { password: true }`. Elements marked `data-private` are blocked
    (`blockSelector`), so a later screen can opt out.
  - Load it with `import()` on the first click, so it's not in the app's bundle.
- **Console:** rrweb's console plugin, for errors and warnings only, plus `window` `error` and
  `unhandledrejection`. This also catches what [error-handling.md](error-handling.md) logs, without
  depending on it.
- **Requests:** while recording, a `fetch` wrapper notes each remote function call and page data
  request: name or path, status, duration and size. Not the bodies.
- **Context at the start:**
  - the URL and route id
  - `version` from `$app/environment`
  - user id and name, organization id and slug, role
  - the enabled modules
  - viewport, user agent, locale, time zone
  - theme, mode and density
  - whether the browser is online

### Upload and storage

- The client compresses the events with `CompressionStream("gzip")`. The limit is 20 MB
  compressed. The 10-minute cap makes that unlikely, but a report over the limit is refused with a
  message.
- **Upload:** through a gated server route. Choose between a remote `form` with a `File` field and a
  `+server.ts` POST, and write down why in the code. Kit's body size limits and the Worker's 100 MB
  request limit decide it. A `+server.ts` runs its own gate, the same as `forUsers` plus a signed-in
  tenant: office or engineer, not a customer contact.
- **R2:** a `BUG_REPORTS` bucket binding in `wrangler.jsonc`, in production and in `env.staging`,
  because bindings aren't inherited. On Node, a folder from `BUG_REPORTS_DIR` (default
  `.bug-reports/`, git-ignored). One small interface over both (`put`, `get`) in
  `src/lib/server/bug-reports/`. The object key is `<year>/<month>/<id>.json.gz`.
- **`bug_report` table:**
  - id
  - organizationId and userId (both nullable, `set null` on delete)
  - userName, url, routeId, note, userAgent, appVersion
  - startedAt, durationMs, size, objectKey, createdAt

  Read `docs/agents/database.md` first. This table is the platform's, not a tenant's business data:
  reporters can't read it at all, and developers read it across tenants. Say so in the schema's
  comment. Find out whether a spec enforces `recordActivity()` or tenant scoping on every table, and
  exempt this table explicitly there with the reason. It isn't logged to the activity log, because
  it's not a change to the tenant's records.

- **Email:** after the transaction, `sendMail()` (`src/lib/server/mail/`) to `BUG_REPORT_EMAIL`. The
  subject is "Bug report from {user} at {organization}: {note's first line}". The body has the
  context, the console errors and a link to the replay page. With no SMTP and no outbox, it's
  logged, as `sendMail()` already does.

### Replay pages

- A gated set `forDevelopers` in `src/lib/server/remote-functions.ts`: a signed-in user whose email
  is in `DEVELOPER_EMAILS` (a comma-separated env var or secret). Everyone else gets a 404, so the
  pages don't reveal that they exist.
- `/ops/bug-reports` lists the reports, newest first, with organization, user, note, URL and age.
  `/ops/bug-reports/[id]` shows the replay with `rrweb-player`, and beside it the context, the note,
  the console entries and the requests. A console entry or request jumps the player to its moment.
  Pick a route group that has no tenant shell. Developers aren't necessarily members of the tenant.
- The player is lazy-loaded too.

### Text

All UI text is in Paraglide `en` and `nl`. Read `docs/agents/i18n.md`. The ops pages are for the
developer, but follow the same rule.

## Steps

1. Dependency vetting, then the recorder component with its state machine (idle, recording,
   stopping, sending), in both headers.
2. Storage interface, table and migration, upload route with its gate and limits, email.
3. `forDevelopers`, the list and replay pages.

## Tests

- **Unit:** the state machine, the context collector, and the storage interface on Node.
- **Server spec:**
  - The upload refuses signed-out users, customer contacts and oversized bodies.
  - It stores the report under the uploader's own tenant, ignoring any tenant in the body.
  - It mails `BUG_REPORT_EMAIL`.
  - `forDevelopers` refuses a user not on the list with a 404.
  - A tenant's member can't read a report.
- **e2e:**
  - Record a short session in the office app (click, type in a field, navigate once), stop, add a
    note and send. Check the toast, the mail in `MAIL_OUTBOX`, and the row.
  - A developer opens the list, and the replay page loads its player.
  - The engineer portal shows the button.
  - A password typed during a recording isn't in the stored events.

## Out of scope

The customer portal, attaching screenshots, creating issues in a tracker, and deleting or archiving
reports from the ops page (a follow-up, when there are enough of them).

## As built

- **Packages**: `@rrweb/record`, `@rrweb/rrweb-plugin-console-record` and `rrweb-player`, exactly
  2.1.7 (2 October 2026, tagged upstream). Vetted from rrweb's own guide and console recipe, which
  name these packages and imports; their npm `repository` is `rrweb-io/rrweb`, with registry
  signatures and SLSA provenance. `@rrweb/record` is rrweb's record half only, with the same
  events. All three are loaded with `import()`: none is in the app's bundle.
- **Where**: `src/lib/bug-reports/` rather than `src/lib/components/bug-report/`, as the server and
  the ops pages share part of it: the button (`bug-report-button.svelte`, one line in each header),
  the recorder (`recorder.svelte.ts`: one per tab, outside the components), its states
  (`machine.ts`), the context collector (`context.ts`), the fetch wrapper (`requests.ts`), and the
  shared parts: the limits and the summary's schema (`report.ts`), reading the events
  (`events.ts`), the context's lines (`context-lines.ts`). The server's part is
  `src/lib/server/bug-reports/`.
- **The button**: closing the popover without a choice keeps the recording (the button shows a send
  icon that opens it again) rather than discarding it. Sending that fails leaves it there to send
  again. In the engineer portal it's `compact`: only the dot while it records, without the time
  (still in its label), as that header, with the notification bell, is full on a phone.
- **Console**: the plugin with `level: ["error", "warn"]`, which already listens for the window's
  `error` and `unhandledrejection` itself: no listeners of our own.
- **Requests** are rrweb custom events (`tag: "request"`), so they're in the recording with their
  moments, and the replay page reads them from the events as it reads the console's. The size is
  the `Content-Length`, when there is one.
- **Context**: the browser collects the page, version, viewport, user agent, locale (and the
  browser's languages), time zone, theme, mode, dark and density, and online. Who, in which
  organization (name and slug), with which roles and modules, the server adds from the session when
  the report arrives, instead of taking the browser's word. It's all stored in a `context` JSON
  column, added to the table: the planned columns had no place for it.
- **Upload**: `POST /bug-reports` (`src/routes/bug-reports/+server.ts`), not a remote `form`: the
  recorder sends from script, and the endpoint refuses by `Content-Length` before reading. SvelteKit
  has no body limit of its own for either; the platforms' are the Worker's 100 MB, `adapter-node`'s
  `BODY_SIZE_LIMIT` (512 KB unless raised) and Vercel's 4.5 MB per request. The body is multipart:
  `events` (the gzipped JSON array of events) and `report` (JSON: note, start, duration, the
  browser's context, and up to 50 console errors as text, for the mail). 411 without a length, 413
  over 20 MB (plus 256 KB for the form) or for a larger file, 400 for anything that isn't a report
  or isn't gzip, 201 with the id. The gate (`requireReporter()`): `requireTenant()`, then a 403 for
  customers' contacts.
- **The guard** (`hooks.server.ts`) lets field engineers and customers' contacts through to
  `/bug-reports` and `/ops/…`, which gate themselves: it sent engineers' uploads to `/my`.
- **Table**: the id is a random UUID, made before the insert so the object's key has it; `startedAt`
  in milliseconds. No spec enforces tenant scoping or `recordActivity()` per table (checked), so
  there was nothing to exempt; the schema's comment says why it's neither. Indexes on the two
  foreign keys (`foreign-key-indexes.spec.ts`) and on `created_at` for the list.
- **Storage**: `bugReportStore()` is the `BUG_REPORTS` binding when the platform has one, else the
  folder; the folder store refuses keys outside it. The recording is stored before the row, the
  mail sent after it; a mail that fails doesn't fail the report. Without `BUG_REPORT_EMAIL` the mail
  is logged. The mail is in the reporter's language, its link from `ORIGIN` (or the request's).
- **Settings** are read in one file, `src/lib/server/bug-reports/settings.ts`, which specs mock:
  mocking `$app/env/private` in a harness spec replaced the test database's URL too.
  `DEVELOPER_EMAILS` is parsed (lower case, comma-separated) in `src/env.ts`.
- **`forDevelopers`**: `requireDeveloper()` (`src/lib/server/bug-reports/developers.ts`), a 401
  signed out and a 404 for everyone not listed.
- **Ops pages**: the `(ops)` route group with a plain layout; the list shows the newest 500. The
  replay page fetches the recording from `GET /ops/bug-reports/[id]/recording` (gzip, gated by
  `requireDeveloper()`; a query would pass megabytes through devalue), unpacks it in the browser
  with `DecompressionStream`, and mounts `rrweb-player` (and its CSS) in an attachment.
- **Text** is in a new message section, `bugs.json`.
- **Tests**: unit specs for the states, the recorder with fake parts, the context collector, the
  fetch wrapper, reading events and both stores; the server spec
  `src/tests/unit/lib/server/bug-reports/upload.spec.ts`; e2e `src/tests/e2e/bug-reports.test.ts`.
  The e2e servers get `BUG_REPORT_EMAIL`, `DEVELOPER_EMAILS` (SHLTR's owner) and a
  `BUG_REPORTS_DIR` per lane (`global-setup.ts`). The e2e file is a sequence of short tests (start,
  record, stop and send, the row and mail, the password, the portal, the list, the replay, the
  404), each wait with a 15 s timeout: as one 30 s test, it timed out without saying where when
  the machine was loaded (load average ~100 under another full run). The player mounted all
  along; it only took that long to load then.
- **Open**: on Vercel a report over 4.5 MB is refused by the platform, and its functions have no
  disk that lasts, so reports there need a store of their own (e.g. R2 over its S3 API) if wanted;
  where the app runs on `adapter-node`, `BODY_SIZE_LIMIT` must be raised above 20 MB. Deleting
  reports and expiring old recordings are follow-ups. Before production on Cloudflare: make the
  buckets (`wrangler r2 bucket create fieldworks-bug-reports` and
  `fieldworks-staging-bug-reports`) and set `BUG_REPORT_EMAIL` and `DEVELOPER_EMAILS`.
