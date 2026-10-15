/**
 * Waiting for a page's network to go quiet, which the tests do after most steps. Playwright's
 * `networkidle` never comes while a page has a live query (`query.live`) open, a stream that stays
 * open as long as the page shows it (the schedule board's `watchSchedule`), so `quiet()` waits for
 * the page's other requests: none in flight for half a second, as `networkidle` counts. Unlike
 * `networkidle`, which Chromium reports once per document, it also waits after a client-side
 * step (a submit, a navigation in the app).
 */
import type { BrowserContext, Page, Request } from "playwright";

/** How long no request may be in flight before the network counts as quiet. */
const quietFor = 500;

/**
 * How long a request may go unanswered before it no longer counts: the browser abandons some
 * requests of a page that moved on (a query it no longer needs, a table's memory saved as it
 * goes) without Playwright hearing of it, neither an answer nor a failure. The app answers the
 * tests' requests well within it.
 */
const abandonedAfter = 5_000;

/** How long `quiet()` waits at most. */
const timeout = 20_000; // below the tests' 30 s, so its message, naming the requests, shows

/**
 * Whether `quiet()` waits for `request`: all of the page's, scripts too (so it waits for the page
 * to hydrate, as `networkidle` did), but a live query's stream, which stays open (SvelteKit asks
 * for it as `text/event-stream`).
 */
const counts = (request: Request) => !request.headers().accept?.includes("text/event-stream");

/** The requests in flight of each page, and when the last of them ended. */
const pages = new WeakMap<Page, { inFlight: Map<Request, number>; lastChange: number }>();
const tracked = new WeakSet<BrowserContext>();

/** Starts counting the requests of every page of `context` (`useApp()` does, for its pages). */
export function trackNetwork(context: BrowserContext) {
	if (tracked.has(context)) return;
	tracked.add(context);
	const stateOf = (request: Request) => {
		const page = request.frame().page();
		let state = pages.get(page);
		if (!state) pages.set(page, (state = { inFlight: new Map(), lastChange: Date.now() }));
		return state;
	};
	const ended = (request: Request) => {
		const state = stateOf(request);
		if (state.inFlight.delete(request)) state.lastChange = Date.now();
	};
	context.on("request", (request) => {
		if (!counts(request)) return;
		const state = stateOf(request);
		// A new document in the page: the old one's requests are left behind (one cut off, a table's
		// memory saved as the page goes), and Playwright doesn't always report them as ended, so
		// they no longer count. (A client-side navigation loads no document.)
		if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
			state.inFlight.clear();
		}
		state.inFlight.set(request, Date.now());
		state.lastChange = Date.now();
	});
	// Answered is enough: Playwright doesn't always report the end of a request whose page moved on
	// (a query the page no longer needs), and the app's answers are small.
	context.on("response", (response) => ended(response.request()));
	context.on("requestfinished", ended);
	context.on("requestfailed", ended);
}

/**
 * Waits until no request of `page` (but live queries' streams) has been in flight for half a
 * second: `page.waitForLoadState("networkidle")` for pages that may hold a live query open.
 */
export async function quiet(page: Page) {
	if (!tracked.has(page.context())) {
		// Requests already under way weren't counted: let the page load first.
		trackNetwork(page.context());
		await page.waitForLoadState("load");
	}
	const deadline = Date.now() + timeout;
	while (true) {
		const state = pages.get(page);
		const now = Date.now();
		const pending = [...(state?.inFlight ?? [])].filter(([, at]) => now - at < abandonedAfter);
		const since = now - (state?.lastChange ?? 0);
		if (!pending.length && since >= quietFor) return;
		if (now > deadline) {
			const urls = pending.map(([request]) => request.url());
			throw new Error(`The network didn't go quiet in ${timeout} ms: ${urls.join(", ")}`);
		}
		await page.waitForTimeout(pending.length ? 50 : quietFor - since);
	}
}
