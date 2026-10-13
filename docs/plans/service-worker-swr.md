# Spike: a service worker that answers remote queries stale-while-revalidate

Branch `service-worker-swr` (October 2026). The question: on Vercel with Turso, navigating is slow
because each page waits for its remote queries' round trips to the database. Can a service worker
make the office feel snappy? Off unless switched on per browser (`?sw=on`, `?sw=off`).

## What it does

- **It replays answers, it doesn't run remote functions.** A worker can't run them: they need the
  database and the request's session, which are on the server. But a remote `query` is a plain
  `GET /_app/remote/<file hash>/<name>?payload=…` with a JSON answer, so the worker can keep and
  replay the answers without knowing anything about the function (`src/service-worker/index.ts`).
- **Stale-while-revalidate.** A cached answer is served at once, and the worker asks the server
  again in the background. If the answer changed, it tells the tab (`swr:updated`), which calls
  `refreshAll()`; for that refresh (`swr:refreshing`) the worker answers from its cache without
  asking again, so there's no second round trip and no refresh loop.
- **Changes come first.** Any other request (a command, a form, a sign-in) makes the answers stored
  before it network-first until asked again, so the app never shows data older than the user's own
  change. Remembering a table's state (`rememberTable`) only outdates its own file's answers.
  Signing out or switching organizations deletes the cache.
- **Scoped.** The cache is per user, organization, language and time zone (hashed); the office
  shell tells the worker (`swr:scope`, `src/routes/(app)/swr-worker.ts`), and without a scope it
  caches nothing.
- **Warming.** The worker remembers which queries each page asked for (`swr:page`), and asks for
  them again for the sidebar's pages once the shell is up (`swr:warm`), so revisits show recent
  data.
- **With hover preloading (`forkPreloads`).** Hovering a link renders its page ahead, in a fork,
  with its queries. The user isn't waiting yet, so on hover (`swr:hover`) the worker asks again for
  that page's queries and holds the preload's answers until the fresh ones are in: a page hovered
  long enough opens with fresh data, at once and without a refresh. A click (`swr:page`) releases
  what's held with the cached answers, so a quick click is never slower than without the hold. A
  page SvelteKit still has in memory is preloaded without asking for its queries at all; if the
  worker's fresh answers differ, it tells the tab, whose refresh updates them before the click.

## Results

`node scripts/sw-benchmark.ts` against a production build with every remote call held up 600 ms
(`sw-preview` in `.claude/launch.json`; the delay hook now also runs outside `vp dev`). Click on a
sidebar link → SvelteKit commits the new page, median over customers, equipment, engineers, orders,
with hover preloading on (main):

|                     | worker off | worker on |
| ------------------- | ---------: | --------: |
| first visit, click  |     674 ms |    689 ms |
| again, click        |     673 ms |     66 ms |
| again, hover 100 ms |     529 ms |     45 ms |
| again, hover 300 ms |     328 ms |     57 ms |
| again, hover 1 s    |      64 ms |     46 ms |

So preloading is instant once the hover outlasts the round trips, and the worker makes every revisit
instant, hover or not. `node scripts/sw-check.ts`, with a customer renamed by someone else (in the
database):

- revisited with a click: the old name at commit (~30 ms), the new one ~1.3 s later, then quiet;
- hovered 1.5 s, then clicked: the new name at commit (~30 ms), never the old one;
- hovered 100 ms, then clicked: the old name at commit, the new one ~0.5 s later;
- renamed in the app instead: the old name never shows again.

## What's left, if it's adopted

- **Targeted refresh.** `refreshAll()` refreshes every query on the page, and waits for the shell's
  queries the worker has never seen (they were server-rendered), which costs one extra round trip
  the first time. SvelteKit has no public way to refresh one query by its key, which is what the
  worker knows; that would be worth asking for upstream.
- **First visits** aren't faster: the worker learns a page's queries by seeing it. What it learned
  survives reloads, so it helps from the second session on. Seeding it with the server-rendered
  answers would help first visits after a full load.
- **Other people's changes** show stale for one round trip. Fine for lists and dashboards; for a
  form that's being edited, a page could opt out (network-first).
- **SvelteKit 3.0.0 bug:** `$app/env`'s `version` is `undefined` in the worker (it reads the page's
  payload global); the worker names its caches after a hash of `$app/manifest`'s files instead.
- **A hover that ends** without a click leaves the worker's fresh answers in the cache, and the
  revalidation it started may refresh the tab's queries once; cheap, but not free on Turso.
- **Not covered by the e2e tests** (they run with the worker off); `?sw=on` in a test would need
  its own file.
