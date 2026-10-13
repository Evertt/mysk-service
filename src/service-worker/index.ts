/**
 * An experiment: the service worker answers the office's remote queries from a cache while it asks
 * the server again (stale-while-revalidate), so a page the user has seen before opens at once, with
 * the data it had, and catches up a round trip later.
 *
 * - **What it caches**: a remote query is a `GET /_app/remote/<file hash>/<name>?payload=…`, whose
 *   JSON answer the worker keeps as it came. It never runs a remote function itself (they run on
 *   the server, against the database): it only replays answers.
 * - **Stale, then fresh**: a cached answer is served at once, and the worker asks the server again
 *   in the background. If the answer differs, it stores it and tells the tab (`swr:updated`), which
 *   refreshes its queries (`swr:refreshing`); for that refresh the worker answers what it has
 *   from the cache, without asking the server again.
 * - **After a change**: any other request (a command, a form, a sign-in) may have changed what the
 *   queries answer, so answers stored before it are asked for again before they're shown
 *   (network first) instead of shown stale. Asking for a table's memory (`quietChanges`) only
 *   outdates the answers of its own file. Signing out or switching organizations drops the lot.
 * - **Whose data**: the answers are the signed-in user's, in their organization, language and time
 *   zone. A page tells the worker this scope (`swr:scope`); each scope has a cache of its own, the
 *   others are deleted when it changes, and without one the worker caches nothing.
 * - **Warming**: the worker remembers which queries each page asked for (`swr:page`), and asks for
 *   them again when the page says the user may go there (`swr:warm`: hovering a link, the
 *   sidebar's links once the shell is up), so the cache is fresh by the time they click.
 */
import { immutable } from "$app/manifest";
import { self } from "$app/service-worker";

import type { PageMessage, WorkerMessage } from "./protocol.ts";

/**
 * The build, for naming its caches: the hash of its immutable files' names. (`$app/env`'s `version`
 * is `undefined` in the worker in SvelteKit 3.0.0: it reads the page's payload, which a worker
 * hasn't got.)
 */
const version = fnv1a(immutable.map((file) => file.path).join()).toString(36);

function fnv1a(text: string) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	return hash >>> 0;
}

const remotePath = "/_app/remote/";

/**
 * How long an answer the worker just got is shown as it is, without asking the server again: the
 * same query asked for twice in one go.
 */
const freshFor = 1_000;
/** How long a tab's refresh for new answers (`swr:refreshing`) takes the cache's answers as they are. */
const refreshFor = 3_000;
/** How old an answer has to be for warming to ask for it again. */
const warmAfter = 30_000;
/** How many requests warming has in flight at once. */
const warmConcurrency = 4;
/** How many pages, and queries per page, the worker remembers for warming. */
const maxPages = 100;
const maxQueriesPerPage = 40;

/** Changes that outdate only the answers of their own remote file (by its hash). */
const quietChanges = new Set(["rememberTable"]);
/** Changes after which nothing cached is the user's any more. */
const scopeChanges = new Set(["signOut", "switchOrganization"]);

/** The headers the worker adds to a stored answer: when it asked for it, and when it got it. */
const askedAtHeader = "x-swr-asked-at";
const storedAtHeader = "x-swr-stored-at";

const cachePrefix = `swr-${version}-`;
const metaCacheName = `swr-meta-${version}`;
const metaKey = "/__swr/meta";

/** What the worker keeps between its restarts (the browser stops an idle worker). */
interface Meta {
	/** The scope the answers are cached for; none until a page names one. */
	scope: string | null;
	/** When the last change was made: answers asked for before it are outdated. */
	changedAt: number;
	/** The same for quiet changes, by remote file hash. */
	fileChangedAt: Record<string, number>;
	/** The query URLs each page (path and search) asked for, most recently seen page last. */
	pages: Record<string, string[]>;
}

let meta: Meta = { scope: null, changedAt: 0, fileChangedAt: {}, pages: {} };

const loaded = (async () => {
	const response = await (await caches.open(metaCacheName)).match(metaKey);
	if (response) meta = { ...meta, ...((await response.json()) as Partial<Meta>) };
})();

let saving: Promise<void> | undefined;
/** Saves `meta`, once for all the changes made in the same moment. */
function saveMeta() {
	saving ??= Promise.resolve().then(async () => {
		saving = undefined;
		await (await caches.open(metaCacheName)).put(metaKey, Response.json(meta));
	});
	return saving;
}

/** The page each tab is on (by client id), for remembering which queries a page asks for. */
const tabPages = new Map<string, string>();

/** The name of a remote function's request (`/_app/remote/<hash>/<name>`), and its file's hash. */
function remoteName(url: URL) {
	const [hash = "", name = ""] = url.pathname.slice(remotePath.length).split("/");
	return { hash, name };
}

/** Whether an answer asked for at `askedAt` may predate a change to what `url` answers. */
function outdated(url: URL, askedAt: number) {
	return askedAt < Math.max(meta.changedAt, meta.fileChangedAt[remoteName(url).hash] ?? 0);
}

async function scopeCache(scope: string) {
	return caches.open(cachePrefix + scope);
}

/** Deletes the caches of other scopes and versions than `keep`. */
async function deleteCaches(keep?: string) {
	for (const name of await caches.keys()) {
		const ours = name.startsWith("swr-");
		if (ours && name !== keep && name !== metaCacheName) await caches.delete(name);
	}
}

async function setScope(scope: string | null) {
	await loaded;
	if (meta.scope === scope) return;
	meta.scope = scope;
	if (!scope) meta.pages = {};
	await deleteCaches(scope ? cachePrefix + scope : undefined);
	await saveMeta();
}

/**
 * Asks the server for `url` and stores a successful answer for `scope`, unless a change or another
 * scope came along while it was on its way. Answers with the response, and its body if it stored it.
 */
async function fetchAndStore(url: URL, scope: string) {
	const askedAt = Date.now();
	const response = await fetch(url, { credentials: "same-origin" });
	if (!response.ok) return { response };

	const body = await response.clone().text();
	if (!storable(body) || meta.scope !== scope || outdated(url, askedAt)) return { response };

	const headers = new Headers(response.headers);
	headers.set(askedAtHeader, String(askedAt));
	headers.set(storedAtHeader, String(Date.now()));
	const stored = new Response(body, { status: response.status, headers });
	await (await scopeCache(scope)).put(url.href, stored);
	return { response, body };
}

/** A result to keep: not an error (answered with a 200 too) or a redirect. */
function storable(body: string) {
	try {
		const answer = JSON.parse(body) as { type?: string; data?: string };
		return answer.type === "result" && !answer.data?.startsWith('[{"redirect":');
	} catch {
		return false;
	}
}

/** Requests for the same URL in flight, shared: revalidating and warming ask for each only once. */
const inFlight = new Map<string, Promise<string | undefined>>();

/** Asks the server again for `url`; answers with the new body if it stored one. */
function revalidate(url: URL, scope: string) {
	const key = `${scope} ${url.href}`;
	let request = inFlight.get(key);
	if (!request) {
		request = fetchAndStore(url, scope)
			.then(({ body }) => body)
			.catch(() => undefined)
			.finally(() => inFlight.delete(key));
		inFlight.set(key, request);
	}
	return request;
}

async function rememberQuery(clientId: string, url: URL) {
	const page = tabPages.get(clientId);
	if (!page) return;
	const queries = (meta.pages[page] ?? []).filter((known) => known !== url.href);
	// Reinserted, so the most recently seen page is last and the oldest go first.
	delete meta.pages[page];
	meta.pages[page] = [...queries, url.href].slice(-maxQueriesPerPage);
	const pages = Object.keys(meta.pages);
	for (const old of pages.slice(0, Math.max(0, pages.length - maxPages))) delete meta.pages[old];
	await saveMeta();
}

/** Until when each tab (by client id) refreshes for new answers it was told about. */
const refreshing = new Map<string, number>();

async function notify(clientId: string, url: URL) {
	const client = await self.clients.get(clientId);
	client?.postMessage({ type: "swr:updated", url: url.href } satisfies WorkerMessage);
}

/** Answers a remote query: from the cache if it has a recent enough answer, else from the server. */
async function answerQuery(event: FetchEvent, url: URL): Promise<Response> {
	await loaded;
	const { scope } = meta;
	if (!scope) return fetch(event.request);

	event.waitUntil(rememberQuery(event.clientId, url));

	const cached = await (await scopeCache(scope)).match(url.href);
	const askedAt = Number(cached?.headers.get(askedAtHeader) ?? 0);
	const storedAt = Number(cached?.headers.get(storedAtHeader) ?? 0);

	if (!cached || outdated(url, askedAt)) {
		// Network first; the outdated answer only if the server can't be reached.
		try {
			return (await fetchAndStore(url, scope)).response;
		} catch (error) {
			if (cached) return cached;
			throw error;
		}
	}

	const isRefreshing = Date.now() < (refreshing.get(event.clientId) ?? 0);
	if (isRefreshing || Date.now() - storedAt < freshFor) return cached;

	const cachedBody = await cached.clone().text();
	event.waitUntil(
		revalidate(url, scope).then(async (body) => {
			if (body !== undefined && body !== cachedBody) await notify(event.clientId, url);
		}),
	);
	return cached;
}

/** Notes a request that may change what the queries answer (see the module's comment). */
function noteChange(url: URL) {
	const { hash, name } = remoteName(url);
	const isRemote = url.pathname.startsWith(remotePath);
	if (url.pathname.startsWith("/api/auth/") || (isRemote && scopeChanges.has(name))) {
		void setScope(null);
		return;
	}
	// Synchronously, so the queries refreshed right after the change don't get the stale answers.
	if (isRemote && quietChanges.has(name)) meta.fileChangedAt[hash] = Date.now();
	else meta.changedAt = Date.now();
	void loaded.then(saveMeta);
}

/** Asks again for the queries of `paths` whose answers are missing or older than `warmAfter`. */
async function warm(paths: string[]) {
	await loaded;
	const { scope } = meta;
	if (!scope) return;
	const cache = await scopeCache(scope);
	const due: URL[] = [];
	for (const href of new Set(paths.flatMap((path) => meta.pages[path] ?? []))) {
		const url = new URL(href);
		const cached = await cache.match(href);
		const storedAt = Number(cached?.headers.get(storedAtHeader) ?? 0);
		const askedAt = Number(cached?.headers.get(askedAtHeader) ?? 0);
		if (!cached || outdated(url, askedAt) || Date.now() - storedAt > warmAfter) due.push(url);
	}
	const workers = Array.from({ length: warmConcurrency }, async () => {
		for (let url = due.shift(); url; url = due.shift()) await revalidate(url, scope);
	});
	await Promise.all(workers);
}

self.addEventListener("install", () => {
	void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	// Answers stored by an older version may not fit its remote functions.
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name.startsWith("swr-") && !name.includes(`-${version}`)) await caches.delete(name);
			}
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (event.request.method !== "GET") {
		noteChange(url);
		return;
	}
	// A plain query's request (`query.live` streams events, which aren't for keeping).
	const streams = event.request.headers.get("accept")?.includes("text/event-stream");
	if (url.pathname.startsWith(remotePath) && !streams) {
		event.respondWith(answerQuery(event, url));
	}
});

self.addEventListener("message", (event) => {
	const message = event.data as PageMessage;
	const clientId = event.source && "id" in event.source ? event.source.id : undefined;
	switch (message.type) {
		case "swr:scope":
			event.waitUntil(setScope(message.scope));
			break;
		case "swr:page":
			if (clientId) tabPages.set(clientId, message.path);
			break;
		case "swr:refreshing":
			if (clientId) refreshing.set(clientId, Date.now() + refreshFor);
			break;
		case "swr:warm":
			event.waitUntil(warm(message.paths));
			break;
	}
});
