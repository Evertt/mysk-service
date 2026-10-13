/**
 * The messages between the office's pages and the service worker (`index.ts`), which answers
 * remote queries from its cache while it asks the server again (stale-while-revalidate). Plain
 * types, shared by both sides: the page imports them as types only.
 */

/** From a page to the worker. */
export type PageMessage =
	/**
	 * Whose data the server answers with now: the user, organization, language and time zone. The
	 * worker keeps a cache per scope and answers from none until a page names one.
	 */
	| { type: "swr:scope"; scope: string }
	/**
	 * The page this tab is going to, when a navigation starts and ends: the queries it asks for from
	 * now on are that page's.
	 */
	| { type: "swr:page"; path: string }
	/**
	 * The tab refreshes its queries because the worker told it of new answers (`swr:updated`): for a
	 * moment, the worker answers from its cache without asking the server again.
	 */
	| { type: "swr:refreshing" }
	/** Pages the user may open next: the worker asks again for the queries it saw them make. */
	| { type: "swr:warm"; paths: string[] }
	/**
	 * The user hovers a link to `path`: the worker warms it, and holds the answers of its preload
	 * until the fresh ones are in or the tab navigates (`swr:page`).
	 */
	| { type: "swr:hover"; path: string };

/** From the worker to a page. */
export type WorkerMessage =
	/**
	 * A query the worker answered from its cache has a different answer now, in the cache:
	 * refresh the page's queries to show it.
	 */
	{ type: "swr:updated"; url: string };
