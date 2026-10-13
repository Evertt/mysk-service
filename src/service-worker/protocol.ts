/**
 * The messages between the office's pages and the service worker (`index.ts`), which answers
 * remote queries from its cache while it asks the server again (stale-while-revalidate). Plain
 * types, shared by both sides: the page imports them as types only.
 */

/** From a page to the worker. */
export type PageMessage =
	/**
	 * Whose data the server answers with now: the user, organization, language and time zone, and
	 * the app's version. The worker keeps a cache per scope and answers from none until a page names
	 * one.
	 */
	| { type: "swr:scope"; scope: string }
	/**
	 * The page this tab is going to, when a navigation starts and ends: the queries it asks for from
	 * now on are that page's.
	 */
	| { type: "swr:page"; path: string }
	/** Pages the user may open next: the worker asks again for the queries it saw them make. */
	| { type: "swr:warm"; paths: string[] }
	/**
	 * The user hovers a link to `path`: the worker warms it, and holds the answers of its preload
	 * until the fresh ones are in or the tab navigates (`swr:page`).
	 */
	| { type: "swr:hover"; path: string };

/** From the worker to a page. */
export type WorkerMessage =
	/** The worker answered the query at `url` from its cache, and asks the server for a newer answer. */
	| { type: "swr:revalidating"; url: string }
	/** The server's answer to the query at `url` is the one the worker gave, or didn't come. */
	| { type: "swr:revalidated"; url: string }
	/**
	 * The query at `url` has a different answer now, in the worker's cache: refresh it to show it.
	 */
	| { type: "swr:updated"; url: string };
