/**
 * An experiment: the service worker answers the office's remote queries from a cache while it asks
 * the server again (stale-while-revalidate), so a page the user has seen before opens at once, with
 * the data it had, and catches up a round trip later. It also keeps the build's files from when
 * it's installed (`files`), so no page waits for its JavaScript.
 *
 * - **What it caches**: a remote query is a `GET /_app/remote/<file hash>/<name>?payload=…`, whose
 *   JSON answer the worker keeps as it came. It never runs a remote function itself (they run on
 *   the server, against the database): it only replays answers. A page's server data
 *   (`__data.json`, a module page's guard) it keeps the same way (`isPageData`).
 * - **Stale, then fresh**: a cached answer is served at once, and the worker asks the server again
 *   in the background. If the answer differs, it stores it and tells the tab (`swr:updated`), which
 *   refreshes that query; the refresh finds the new answer in the cache (`freshFor`), without
 *   asking the server again.
 * - **After a change**: any other request (a command, a form, a sign-in) may have changed what the
 *   queries answer, so answers stored before it are asked for again before they're shown
 *   (network first) instead of shown stale. Asking for a table's memory (`quietChanges`) only
 *   outdates the answers of its own file. Signing out or switching organizations drops the lot.
 * - **Whose data**: the answers are the signed-in user's, in their organization, language and time
 *   zone, for the app's version. A page tells the worker this scope (`swr:scope`); each scope has a
 *   cache of its own, the others are deleted when it changes, and without one the worker caches
 *   nothing.
 * - **New versions**: SvelteKit notices a new deployment by the version header of the answers it
 *   reads (`x-sveltekit-version`). An answer from a server of another version counts as changed
 *   (`differs`), so the tab reads it, and SvelteKit notices.
 * - **Warming**: the worker remembers which queries each page asked for (`swr:page`), and asks for
 *   them again when the page says the user may go there: the sidebar's links once the shell is up
 *   (`swr:warm`, answers over an hour old: `warmAfter`), a hovered link (`swr:hover`, over 15
 *   seconds old: `freshFor`, so hovering back and forth asks once).
 * - **Hovering**: SvelteKit renders a hovered link's page ahead (`forkPreloads`), with its queries.
 *   The user isn't waiting for that page yet, so the worker holds those queries' answers until the
 *   server's fresh ones are in: the page opens with fresh data, without a refresh. Once they click
 *   (`swr:visit`), it answers what it still holds from the cache at once, as for any navigation.
 * - **Visiting**: a navigation asks again for the page's queries over 15 seconds old (`swr:visit`),
 *   also those the page doesn't ask for itself (opened from a preload, or from queries SvelteKit
 *   still holds), and the tab shows it's checking until they're in.
 */
import { assets, immutable } from "$app/manifest";
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
 * How long an answer the worker got is shown as it is, without asking the server again, by a
 * visit, a hover or a page's own request: data at most this old is fresh enough, and hovering a
 * link back and forth, or the refresh after the tab was told of a new answer, asks once.
 */
const freshFor = 15_000;
/** How long after hovering a link the worker holds its page's answers for fresh ones, at most. */
const holdFor = 3_000;
/**
 * How old an answer has to be for warming the sidebar's pages to ask for it again: an hour after
 * the worker last got it, whether by warming, a hover or a visit.
 */
const warmAfter = 60 * 60 * 1000;
/** How many requests warming has in flight at once. */
const warmConcurrency = 4;
/** How many pages, and queries per page, the worker remembers for warming. */
const maxPages = 100;
const maxQueriesPerPage = 40;
/** How many live queries' last answers the worker remembers (see `passLiveStream`). */
const maxLiveQueries = 100;

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
	/** The last answer each live query's stream brought (by URL), as a hash: see `passLiveStream`. */
	live: Record<string, number>;
}

let meta: Meta = { scope: null, changedAt: 0, fileChangedAt: {}, pages: {}, live: {} };

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
	meta.live = {};
	await deleteCaches(scope ? cachePrefix + scope : undefined);
	await saveMeta();
}

/**
 * An answer as the page sees it: its body, and the app version of the server that gave it, which
 * SvelteKit reads to notice a new deployment (`x-sveltekit-version`, see `updated` in `$app/state`).
 */
interface Answer {
	body: string;
	version: string | null;
}

const versionHeader = "x-sveltekit-version";

async function answerOf(response: Response): Promise<Answer> {
	return { body: await response.clone().text(), version: response.headers.get(versionHeader) };
}

/**
 * Whether the page should be shown `fresh` instead of `shown`: a different body, or a server of
 * another version, which the page only notices by reading the new answer.
 */
function differs(fresh: Answer, shown: Answer) {
	return fresh.body !== shown.body || fresh.version !== shown.version;
}

/**
 * Asks the server for `url` and stores a successful answer for `scope`, unless a change or another
 * scope came along while it was on its way. Answers with the response, and the answer it stored.
 */
async function fetchAndStore(url: URL, scope: string) {
	const askedAt = Date.now();
	const response = await fetch(url, { credentials: "same-origin" });
	if (!response.ok) return { response };

	const answer = await answerOf(response);
	if (!storable(url, answer.body) || meta.scope !== scope || outdated(url, askedAt)) {
		return { response };
	}

	const headers = new Headers(response.headers);
	headers.set(askedAtHeader, String(askedAt));
	headers.set(storedAtHeader, String(Date.now()));
	const stored = new Response(answer.body, { status: response.status, headers });
	await (await scopeCache(scope)).put(url.href, stored);
	return { response, answer };
}

/**
 * A page's server data (`__data.json`): what its server `load`s answer. A module's pages have one,
 * the guard that refuses tenants without the module, so each navigation to them asks the server
 * (a function call and the session's and tenant's lookups); the worker keeps it like a query's.
 */
function isPageData(url: URL) {
	return url.pathname.endsWith("/__data.json");
}

/**
 * An answer to keep: a query's result, not an error (answered with a 200 too) or a redirect; a
 * page's data, not a redirect or a node's error (and not streamed, which doesn't parse).
 */
function storable(url: URL, body: string) {
	try {
		if (isPageData(url)) {
			const data = JSON.parse(body) as { type?: string; nodes?: ({ type?: string } | null)[] };
			return data.type === "data" && !data.nodes?.some((node) => node?.type === "error");
		}
		const answer = JSON.parse(body) as { type?: string; data?: string };
		return answer.type === "result" && !answer.data?.startsWith('[{"redirect":');
	} catch {
		return false;
	}
}

/** Requests for the same URL in flight, shared: revalidating and warming ask for each only once. */
const inFlight = new Map<string, Promise<Answer | undefined>>();

/** Asks the server again for `url`; answers with the new answer if it stored one. */
function revalidate(url: URL, scope: string) {
	const key = `${scope} ${url.href}`;
	let request = inFlight.get(key);
	if (!request) {
		request = fetchAndStore(url, scope)
			.then(({ answer }) => answer)
			.catch(() => undefined)
			.finally(() => inFlight.delete(key));
		inFlight.set(key, request);
	}
	return request;
}

async function rememberQuery(clientId: string, url: URL) {
	const current = tabPages.get(clientId);
	// While a link is hovered, a query the tab's page didn't ask for is the hovered page's preload.
	const hovered = hovers.get(clientId)?.path;
	const isPreload = hovered && !(current && meta.pages[current]?.includes(url.href));
	const page = isPreload ? hovered : current;
	if (!page) return;
	const queries = (meta.pages[page] ?? []).filter((known) => known !== url.href);
	// Reinserted, so the most recently seen page is last and the oldest go first.
	delete meta.pages[page];
	meta.pages[page] = [...queries, url.href].slice(-maxQueriesPerPage);
	const pages = Object.keys(meta.pages);
	for (const old of pages.slice(0, Math.max(0, pages.length - maxPages))) delete meta.pages[old];
	await saveMeta();
}

/** The link each tab (by client id) hovers, until it navigates or `holdFor` has passed. */
interface Hover {
	path: string;
	until: number;
	/** Settles when the tab navigates: what's held is answered from the cache then. */
	navigated: Promise<void>;
	navigate: () => void;
}
const hovers = new Map<string, Hover>();

function startHover(clientId: string, path: string) {
	endHover(clientId);
	const { promise, resolve } = Promise.withResolvers<void>();
	hovers.set(clientId, {
		path,
		until: Date.now() + holdFor,
		navigated: promise,
		navigate: resolve,
	});
}

function endHover(clientId: string) {
	hovers.get(clientId)?.navigate();
	hovers.delete(clientId);
}

/** Whether `url` is a query of the page whose link the tab hovers (its preload's). */
function forHover(clientId: string, url: URL) {
	const hover = hovers.get(clientId);
	return !!hover && Date.now() <= hover.until && !!meta.pages[hover.path]?.includes(url.href);
}

/**
 * For a query of the page whose link a tab hovers: the fresh answer, if it comes before the tab
 * navigates or `holdFor` has passed.
 */
async function freshForHover(clientId: string, url: URL, fresh: Promise<Answer | undefined>) {
	const hover = hovers.get(clientId);
	if (!hover || !forHover(clientId, url)) return;
	const timeout = new Promise<undefined>((done) => setTimeout(done, hover.until - Date.now()));
	return Promise.race([fresh, hover.navigated, timeout]);
}

async function post(clientId: string, message: WorkerMessage) {
	(await self.clients.get(clientId))?.postMessage(message);
}

async function notify(clientId: string, url: URL) {
	await post(clientId, { type: "swr:updated", url: url.href });
}

/**
 * Answers a remote query (or a page's data): from the cache if it has a recent enough answer, else
 * from the server.
 */
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

	const age = Date.now() - storedAt;
	if (age < freshFor) return cached;

	const fresh = revalidate(url, scope);
	if (await freshForHover(event.clientId, url, fresh)) {
		// Stored by now, with the server's headers.
		return (await (await scopeCache(scope)).match(url.href)) ?? cached;
	}

	// The tab shows that it's checking for newer answers (`swr:revalidating`) until it was told of a
	// new one (`swr:updated`) or that there's none (`swr:revalidated`).
	const shown = await answerOf(cached);
	event.waitUntil(post(event.clientId, { type: "swr:revalidating", url: url.href }));
	event.waitUntil(
		fresh.then(async (answer) => {
			if (answer && differs(answer, shown)) await notify(event.clientId, url);
			else await post(event.clientId, { type: "swr:revalidated", url: url.href });
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

/**
 * Asks again for the queries of `paths` whose answers are missing or older than `maxAge`. With a
 * `clientId`, tells that tab of answers that changed: SvelteKit keeps a query a page used in memory
 * for a while, and a preload of the page takes it from there without asking, so the tab refreshes
 * it (`swr:updated`).
 */
async function warm(
	paths: string[],
	{
		maxAge = warmAfter,
		clientId,
		shown = false,
	}: {
		maxAge?: number;
		clientId?: string;
		/** Whether the tab shows what's asked for (the page it visits): it shows it's checking. */
		shown?: boolean;
	} = {},
) {
	await loaded;
	const { scope } = meta;
	if (!scope) return;
	const cache = await scopeCache(scope);
	const due: { url: URL; cached?: Answer }[] = [];
	for (const href of new Set(paths.flatMap((path) => meta.pages[path] ?? []))) {
		const url = new URL(href);
		const cached = await cache.match(href);
		const storedAt = Number(cached?.headers.get(storedAtHeader) ?? 0);
		const askedAt = Number(cached?.headers.get(askedAtHeader) ?? 0);
		if (!cached || outdated(url, askedAt) || Date.now() - storedAt > maxAge) {
			due.push({ url, cached: cached && (await answerOf(cached)) });
		}
	}
	const showing = shown && clientId ? clientId : undefined;
	for (const { url } of due) {
		if (showing) void post(showing, { type: "swr:revalidating", url: url.href });
	}
	const workers = Array.from({ length: warmConcurrency }, async () => {
		for (let next = due.shift(); next; next = due.shift()) {
			const answer = await revalidate(next.url, scope);
			const changed = answer && next.cached && differs(answer, next.cached);
			if (changed && clientId) await notify(clientId, next.url);
			else if (showing) await post(showing, { type: "swr:revalidated", url: next.url.href });
		}
	});
	await Promise.all(workers);
}

/**
 * The build's files: its JavaScript, CSS and fonts (`immutable`, named by their content) and the
 * `static` folder's (`assets`). The worker keeps them from when it's installed, so the app's pages
 * load without asking for them, and answers them from its cache (cache first).
 */
const files = new Set([...immutable, ...assets].map((file) => `/${file.path}`));
const filesPrefix = "files-";
// Named so they sort by when they were made (see `activate`).
const filesCacheName = `${filesPrefix}${Date.now().toString(36).padStart(9, "0")}-${version}`;

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			await (await caches.open(filesCacheName)).addAll([...files]);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			// Answers stored by an older version may not fit its remote functions.
			for (const name of names) {
				if (name.startsWith("swr-") && !name.includes(`-${version}`)) await caches.delete(name);
			}
			// The worker takes over at once (`skipWaiting`), while a tab may still run the previous
			// build and load more of its files: those stay until the build after.
			const builds = names.filter((name) => name.startsWith(filesPrefix)).sort();
			for (const name of builds.slice(0, -2)) await caches.delete(name);
			await self.clients.claim();
		})(),
	);
});

/** A file of the build, this one's or the previous one's, from the cache, else from the server. */
async function answerFile(request: Request) {
	return (await caches.match(request, { ignoreSearch: true })) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (event.request.method !== "GET") {
		noteChange(url);
		return;
	}
	if (files.has(url.pathname) || url.pathname.startsWith("/_app/immutable/")) {
		event.respondWith(answerFile(event.request));
		return;
	}
	// A live query's stream (`query.live`) is passed on, never kept; its events are changes.
	const streams = event.request.headers.get("accept")?.includes("text/event-stream");
	if (streams && url.pathname.startsWith(remotePath)) {
		event.respondWith(passLiveStream(event.request));
		return;
	}
	if (url.pathname.startsWith(remotePath) || isPageData(url)) {
		event.respondWith(answerQuery(event, url));
	}
});

/**
 * A live query's stream, passed on to the tab as it comes. Each event is the query's answer, the
 * first one on opening and another whenever the server's data changed, made by someone else (the
 * tab's own changes are requests the worker sees, `noteChange`). So, as an answer comes in that
 * isn't the one the worker last saw of that query, before the tab gets it, the answers stored until
 * then are outdated: the queries the tab refreshes on it get the server's new answers, not the
 * cache's. That goes for the first one too: a change made while the query wasn't open (the page
 * was elsewhere, or asked for its data just before the stream opened) only shows in it, and the
 * page compares it with what its data was read at (as the schedule's board does). The first answer
 * of a query the worker hasn't seen open counts as new. SvelteKit's stream is Server-Sent Events:
 * `data:` events, and comments (`: keep-alive`) to hold the connection, which aren't answers.
 */
async function passLiveStream(request: Request) {
	await loaded;
	const response = await fetch(request);
	if (!response.ok || !response.body) return response;
	const decoder = new TextDecoder();
	let buffer = "";
	const body = response.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const complete = buffer.split("\n\n");
				buffer = complete.pop() ?? "";
				for (const message of complete) {
					const data = message.split("\n").filter((line) => line.startsWith("data:"));
					if (data.length) noteLiveAnswer(request.url, data.join("\n"));
				}
				controller.enqueue(chunk);
			},
		}),
	);
	return new Response(body, response);
}

/** A live query's answer came in: unless it's the one the worker last saw of it, it's a change. */
function noteLiveAnswer(url: string, data: string) {
	const hash = fnv1a(data);
	if (meta.live[url] === hash) return;
	// Reinserted, so the least recently changed go first.
	delete meta.live[url];
	meta.live[url] = hash;
	const urls = Object.keys(meta.live);
	for (const old of urls.slice(0, Math.max(0, urls.length - maxLiveQueries))) delete meta.live[old];
	noteServerChange();
}

/** The server's data changed elsewhere: every answer stored until now is outdated. */
function noteServerChange() {
	meta.changedAt = Date.now();
	void loaded.then(saveMeta);
}

self.addEventListener("message", (event) => {
	const message = event.data as PageMessage;
	const clientId = event.source && "id" in event.source ? event.source.id : undefined;
	switch (message.type) {
		case "swr:scope":
			event.waitUntil(setScope(message.scope));
			break;
		case "swr:page":
			if (clientId) {
				tabPages.set(clientId, message.path);
				endHover(clientId);
			}
			break;
		case "swr:visit":
			if (!clientId) break;
			tabPages.set(clientId, message.path);
			endHover(clientId);
			// A page that opens from a preload, or from queries SvelteKit still holds, asks for
			// nothing: the visit asks for what it knows the page has, like the page's own requests.
			event.waitUntil(warm([message.path], { maxAge: freshFor, clientId, shown: true }));
			break;
		case "swr:warm":
			event.waitUntil(warm(message.paths));
			break;
		case "swr:hover":
			if (clientId) startHover(clientId, message.path);
			// The user is about to see it.
			event.waitUntil(warm([message.path], { maxAge: freshFor, clientId }));
			break;
	}
});
