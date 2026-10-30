---
title: Offline and the service worker
summary: A service worker makes the office feel instant by showing what it saw last while it checks for news; it is not an offline mode.
section: across
order: 8
status: partly built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

This is partly built, and the title promises more than it does: Fieldworks is not an offline app. A
service worker makes the office fast and gets through short drops in the connection. It does not
let you work without one.

**What you get**

- **Pages you have seen open at once.** Go back to the orders list and it shows what it showed
  last time, immediately, while the worker asks the server for newer data. If something changed, the
  page updates a moment later. While it checks, a small cloud with a turning arrow shows in the
  header (after a short wait, so a quick check doesn't flicker).
- **Hovering a link warms its page.** By the time you click, its data is often fresh already.
- **The app's files load from the browser's cache**, so a reload doesn't wait for the app's
  JavaScript.
- **Your own changes come first.** After you save something, the worker stops showing older answers
  and asks the server, so you never see data older than your own change.
- **A new version announces itself.** When a new release is out, the next navigation loads the new
  version, and a notice says so.

**What you don't get**

- Nothing you change is saved without the network. A save or a form needs the server, and nothing is
  queued for later. Working in the field with a bad signal is not solved.
- When the connection drops, a part of a page that fails shows "You're offline. This tries again by
  itself once you're back online", and retries when the browser says it is back.
- Only the office keeps answers. Every page caches the app's files, but the engineer portal and the
  customer portal don't tell the worker to keep their data.

<TryIt as="planner" />

<HowItWorks />

The worker is `src/service-worker/index.ts`, registered by SvelteKit on every page. It never runs a
remote function; it only replays answers. A remote `query` is a plain
`GET /_app/remote/<file hash>/<name>?payload=…` with a JSON answer, and a batch query a `POST` of its
payloads, kept under a URL of its own.

- **Stale-while-revalidate.** A cached answer under 15 seconds old (`freshFor`) is served as it is.
  An older one is served at once while the worker asks the server again; if the new answer differs,
  it stores it and tells the tab (`swr:updated`), which refreshes just that query. See <SourceLink path="src/service-worker/index.ts" line={365}>answerQuery</SourceLink>.
- **After a change.** Any other request (a command, a form, a sign-in) marks everything stored
  before it as outdated, so those queries go to the network first. The outdated cached answer is
  used only when the server can't be reached.
- **Scoped.** The office shell tells the worker whose data this is (`swr:scope`: user,
  organization, language, time zone and app version), and each scope has a cache of its own.
  Signing out or switching organization deletes it. Without a scope, nothing is cached. See <SourceLink path="src/routes/(app)/swr-worker.ts" line={55}>connectSwrWorker</SourceLink>.
- **Warming.** The worker remembers which queries each page made, and asks for them again for the
  sidebar's pages once the shell is up (answers over an hour old) and for a link on hover.
- **Live streams** (`query.live`) pass through; each answer that arrives from the server counts as a
  change that outdates what was stored.
- **Errors.** A failed `fetch` while the browser is offline is classified as `offline`
  (<SourceLink path="src/lib/errors/classify.ts" line={46}>classify</SourceLink>), which the error
  boundary retries on the `online` event.

It began as a spike for the app on Vercel and Turso, where every navigation waited on database round
trips, and it measured revisits falling from about 670 ms to about 70 ms. The worker's own header
still calls it an experiment.

<DocsPointer doc="docs/plans/service-worker-swr.md" />
