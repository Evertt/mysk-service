# Spike: a service worker that answers remote queries stale-while-revalidate

Branch `service-worker-swr` (October 2026). The question: on Vercel with Turso, navigating is slow
because each page waits for its remote queries' round trips to the database. Can a service worker
make the office feel snappy? SvelteKit registers the worker on every page, the canonical way (its
default `serviceWorker.register`, a module worker, so in `vp dev` too).

## What it does

- **It replays answers, it doesn't run remote functions.** A worker can't run them: they need the
  database and the request's session, which are on the server. But a remote `query` is a plain
  `GET /_app/remote/<file hash>/<name>?payload=…` with a JSON answer, so the worker can keep and
  replay the answers without knowing anything about the function (`src/service-worker/index.ts`).
- **Stale-while-revalidate.** A cached answer is served at once, and the worker asks the server
  again in the background. If the answer changed, it tells the tab (`swr:updated`), which refreshes
  just that query; the refresh finds the new answer in the cache, so there's no second round trip
  and no refresh loop. SvelteKit keys its active queries by exactly what the worker knows
  (`<file hash>/<name>` and the payload, in `query_map`), so the tab finds the query with one
  import of SvelteKit's client runtime (`$kit-client`, aliased in `vite.config.ts`). That's
  internal: if a SvelteKit upgrade moves it, `refreshAll()` does the same job, refreshing every
  query on the page (invisibly: they're answered from the cache, which holds what they show).
- **Showing it.** While the page shows answers the worker is checking (`swr:revalidating`, until
  `swr:updated` or `swr:revalidated`), the header shows a cloud with a turning arrow
  (`sync-indicator.svelte`), after 150 ms so a quick check doesn't flicker.
- **The build's files.** As in SvelteKit's example, the worker caches the build's JavaScript, CSS
  and fonts and the `static` files when it's installed (390 files, 3.8 MB before compression), and
  answers them from its cache: a reload takes all of them (58) from the worker
  (`scripts/sw-files.ts`). Unlike the example, it takes over at once (`skipWaiting`, so remote
  answers never outlive their server version), so it keeps the previous build's files too, for a
  tab still running it.
- **Changes come first.** Any other request (a command, a form, a sign-in) makes the answers stored
  before it network-first until asked again, so the app never shows data older than the user's own
  change. Remembering a table's state (`rememberTable`) only outdates its own file's answers.
  Signing out or switching organizations deletes the cache.
- **Scoped.** The cache is per user, organization, language and time zone (hashed); the office
  shell tells the worker (`swr:scope`, `src/routes/(app)/swr-worker.ts`), and without a scope it
  caches nothing.
- **Warming.** The worker remembers which queries each page asked for (`swr:page`), and asks for
  them again for the sidebar's pages once the shell is up (`swr:warm`), when its answer is over an
  hour old (`warmAfter`; a hover or a visit that got it counts too), so revisits show recent data.
- **Fresh enough: 15 seconds.** An answer at most 15 seconds old (`freshFor`) is shown without
  asking the server again, whether a visit, a hover or a page's own request wants it, so moving back
  and forth over a link asks once. A navigation asks again for its page's older answers
  (`swr:visit`), also those the page doesn't ask for itself (opened from a preload, or from
  queries SvelteKit still holds), with the sync indicator until they're in. Changes of the user's
  own still go first: answers stored before one are asked for again whatever their age.
- **Pages' server data.** A module's pages had a server `load` (the guard that refuses tenants
  without the module), so each navigation to them fetched `__data.json`: on Vercel a function call
  plus the session's and tenant's lookups on Turso, which no cache answered, hence the skeleton on
  `/schedule` and the other module pages. The guard is now a universal `load` (the `(modules)`
  group's generated `+layout.ts`, `#lib/modules/route-guard.ts`) that asks the cached
  `getTenantModules` query, which the worker answers like any other, so no module page's route
  chain has a server load any more and a client-side navigation to one makes no `__data.json`
  request (the probe: before, `/schedule/__data.json` on each click; after, only `getSchedule` and
  `getTenantModules` from the worker). The worker still keeps a page's `__data.json` like a query's
  answer (only plain data: no redirects, error nodes or streamed data), for a server load that may
  come back.
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

- revisited with a click: the old name at commit (~30 ms) and the sync indicator from ~250 ms, the
  new name ~0.65 s later and the indicator gone with it; the worker asked the server 3 times (the
  page's queries), then nothing;
- hovered 1.5 s, then clicked: the new name at commit (~30 ms), never the old one;
- hovered 100 ms, then clicked: the old name at commit, the new one ~0.5 s later;
- renamed in the app instead: the old name never shows again.

## New deployments

SvelteKit notices a new deployment by the `x-sveltekit-version` header of what the server answers,
by `version.json` when the tab is shown or focused, and hourly, and then only sets `updated`; it
reloads by itself only when a navigation fails (a page's code that's gone). The worker would have
hidden the first: a cached answer carries the header of when it was stored, and a fresh answer
with the same body never reached the page. Now:

- **An answer from a server of another version counts as changed** (`differs`), so the tab reads
  it and SvelteKit notices. Without that (`scripts/sw-deploy.ts`, comparing bodies only), a tab on
  the old build never noticed and kept navigating on it.
- **The cache's scope includes the app's version**, so a tab of a newer version never gets an older
  one's answers.
- **The root layout acts on `updated`**: the next navigation loads the page afresh (SvelteKit's own
  pattern), and a tab nobody has touched for an hour reloads by itself (`idle.ts`); either way the
  new page says the app was updated (`new-version.ts`).
- **A new tab** always runs the newest version: the worker keeps no pages, so the page and the
  files it names come from the current deployment.

`node scripts/sw-deploy.ts <url> [idle|fresh]` checks each against a rebuilt and restarted server.

To see what a navigation asks for, and from where, `node scripts/sw-probe.ts <url> /schedule /orders`
logs every request the page and the worker make in a later session's clicks, and hovers back and
forth over the first link.

## What's left, if it's adopted

- **A public way to refresh a query by its key** (what `query_map` gives here) would be worth
  asking SvelteKit for.
- **First visits** aren't faster: the worker learns a page's queries by seeing it. What it learned
  survives reloads, so it helps from the second session on. Seeding it with the server-rendered
  answers would help first visits after a full load.
- **Other people's changes** show stale for one round trip. Fine for lists and dashboards; for a
  form that's being edited, a page could opt out (network-first).
- **SvelteKit 3.0.0 bug:** `$app/env`'s `version` is `undefined` in the worker (it reads the page's
  payload global); the worker names its caches after a hash of `$app/manifest`'s files instead.
- **A hover that ends** without a click leaves the worker's fresh answers in the cache, and the
  revalidation it started may refresh the tab's queries once; cheap, but not free on Turso.
- **The e2e tests block the worker** (`BROWSER_OPTIONS`, `src/tests/e2e/app.ts`): with it, at
  least 18 failed (in a run stopped part-way), mostly because `page.route()`, which they tamper with and slow down requests with, doesn't
  see requests a worker answers. The worker's checks are `scripts/sw-check.ts` and
  `scripts/sw-files.ts`, by hand, against a production build.
