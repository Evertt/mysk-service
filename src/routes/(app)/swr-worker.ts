/**
 * The office's side of the service worker experiment (`src/service-worker/index.ts`), which answers
 * remote queries from its cache while it asks the server again. SvelteKit registers the worker
 * itself, on every page, in development too (as a module worker).
 */
import { version } from "$app/env";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { onMount } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import { getTimeZone } from "#lib/dates.ts";
import { getLocale } from "#lib/paraglide/runtime.js";

import type { PageMessage, WorkerMessage } from "../../service-worker/protocol.ts";

/** How long a query is shown as being checked, at most. */
const giveUpAfter = 15_000;

/**
 * The queries the page shows the worker's cached answers of while the worker asks the server for
 * newer ones, by request URL: while there are any, the header shows it (`sync-indicator.svelte`).
 */
export const revalidating = new SvelteSet<string>();

/**
 * Refreshes the query whose request `href` was, if the page has it (or SvelteKit still keeps it in
 * memory, for a page a preload may render from it): it gets the new answer from the worker's cache.
 * SvelteKit keys its queries by the request's parts, `<file hash>/<name>` and the payload.
 */
async function refreshQuery(href: string) {
	// Left out of the server's build, where SvelteKit's client runtime can't be imported.
	if (import.meta.env.SSR) return;
	const { query_map } = await import("$kit-client");
	const url = new URL(href);
	const id = url.pathname.slice("/_app/remote/".length);
	const payload = url.searchParams.get("payload") ?? "";
	await query_map.get(id)?.get(payload)?.resource.refresh();
}

/** The page's path as the worker remembers it. */
function pagePath(url: URL) {
	return url.pathname + url.search;
}

/**
 * Connects the office shell to the worker, once it's up: tells it whose data the server answers with and which page the tab is on, warms the pages the user may go to next,
 * and refreshes the page's queries when the worker has newer answers than it showed. Call it while
 * the shell's component initializes.
 */
export function connectSwrWorker(tenant: { userId: string; organizationId: string }) {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

	let worker: ServiceWorker | null = null;
	const post = (message: PageMessage) => worker?.postMessage(message);

	// Until the worker is up, the messages wait in a queue, in order.
	const queued: PageMessage[] = [];
	const send = (message: PageMessage) => (worker ? post(message) : queued.push(message));

	beforeNavigate(({ to }) => {
		if (to?.url) send({ type: "swr:page", path: pagePath(to.url) });
	});
	afterNavigate(({ to }) => {
		if (to?.url) send({ type: "swr:page", path: pagePath(to.url) });
	});

	onMount(() => {
		const onMessage = (event: MessageEvent<WorkerMessage>) => {
			const message = event.data;
			switch (message?.type) {
				case "swr:revalidating":
					revalidating.add(message.url);
					// In case the worker's answer never comes (it was stopped, the tab went elsewhere).
					setTimeout(() => revalidating.delete(message.url), giveUpAfter);
					break;
				case "swr:revalidated":
					revalidating.delete(message.url);
					break;
				case "swr:updated":
					void refreshQuery(message.url).finally(() => revalidating.delete(message.url));
					break;
			}
		};
		navigator.serviceWorker.addEventListener("message", onMessage);

		// Once per link the pointer enters (it enters the link's children too), before SvelteKit's
		// preload of its page asks for the page's queries.
		let hovered: Element | null = null;
		const onPointerOver = (event: PointerEvent) => {
			const link = (event.target as Element | null)?.closest?.("a[href]") ?? null;
			if (link === hovered) return;
			hovered = link;
			if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin) return;
			send({ type: "swr:hover", path: pagePath(new URL(link.href)) });
		};
		document.addEventListener("pointerover", onPointerOver);

		void (async () => {
			// SvelteKit registers the worker once the page has loaded.
			const ready = await navigator.serviceWorker.ready;
			worker = navigator.serviceWorker.controller ?? ready.active;
			// With the app's version: a tab of a newer version never gets an older one's answers.
			const scope = [tenant.userId, tenant.organizationId, getLocale(), getTimeZone(), version];
			post({ type: "swr:scope", scope: await digest(scope.join("|")) });
			for (const message of queued.splice(0)) post(message);

			// Once the page has settled, warm the sidebar's pages.
			requestIdleCallback(() => {
				const links = document.querySelectorAll<HTMLAnchorElement>(
					'[data-sidebar="sidebar"] a[href]',
				);
				const paths = [...links]
					.filter((link) => link.origin === location.origin)
					.map((link) => pagePath(new URL(link.href)));
				post({ type: "swr:warm", paths });
			});
		})();

		return () => {
			navigator.serviceWorker.removeEventListener("message", onMessage);
			document.removeEventListener("pointerover", onPointerOver);
		};
	});
}

/** A hash of the scope, so the cache's name doesn't spell out whose it is. */
async function digest(text: string) {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
