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
