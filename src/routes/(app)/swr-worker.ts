/**
 * The office's side of the service worker experiment (`src/service-worker/index.ts`), which answers
 * remote queries from its cache while it asks the server again. Off unless switched on per browser:
 * open any office page with `?sw=on` (and `?sw=off` to unregister it and drop its caches).
 */
import { dev } from "$app/env";
import { afterNavigate, beforeNavigate, refreshAll } from "$app/navigation";
import { onMount } from "svelte";

import { getTimeZone } from "#lib/dates.ts";
import { getLocale } from "#lib/paraglide/runtime.js";

import type { PageMessage, WorkerMessage } from "../../service-worker/protocol.ts";

const storageKey = "swr-worker";

/** Whether the worker is switched on in this browser, after applying a `?sw=` in the URL. */
function switchedOn() {
	try {
		const asked = new URL(location.href).searchParams.get("sw");
		if (asked === "on" || asked === "off") localStorage.setItem(storageKey, asked);
		return localStorage.getItem(storageKey) === "on";
	} catch {
		return false;
	}
}

async function switchOff() {
	const registrations = await navigator.serviceWorker.getRegistrations();
	await Promise.all(registrations.map((registration) => registration.unregister()));
	for (const name of await caches.keys()) {
		if (name.startsWith("swr-")) await caches.delete(name);
	}
}

/** The page's path as the worker remembers it. */
function pagePath(url: URL) {
	return url.pathname + url.search;
}

/**
 * Connects the office shell to the worker, when it's switched on: registers it, tells it whose data
 * the server answers with and which page the tab is on, warms the pages the user may go to next,
 * and refreshes the page's queries when the worker has newer answers than it showed. Call it while
 * the shell's component initializes.
 */
export function connectSwrWorker(tenant: { userId: string; organizationId: string }) {
	// Vite serves no worker in development (SvelteKit bundles it for production builds only).
	if (dev || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
	if (!switchedOn()) {
		void switchOff();
		return;
	}

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
		let refreshing: ReturnType<typeof setTimeout> | undefined;
		const onMessage = (event: MessageEvent<WorkerMessage>) => {
			if (event.data?.type !== "swr:updated") return;
			// Several queries come in at once: one refresh for all of them.
			clearTimeout(refreshing);
			refreshing = setTimeout(() => {
				post({ type: "swr:refreshing" });
				void refreshAll();
			}, 30);
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
			const registration = await navigator.serviceWorker.register("/service-worker.js");
			const ready = await navigator.serviceWorker.ready;
			worker = navigator.serviceWorker.controller ?? ready.active ?? registration.active;
			const scope = [tenant.userId, tenant.organizationId, getLocale(), getTimeZone()].join("|");
			post({ type: "swr:scope", scope: await digest(scope) });
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
			clearTimeout(refreshing);
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
