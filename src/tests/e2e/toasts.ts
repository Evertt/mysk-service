/**
 * The toasts a page showed (svelte-sonner's, in the app's toaster or the engineer portal's phone
 * frame), recorded as they appear, so a test finds one that came and went: a toast shows for 4 s,
 * which waiting for the network to go quiet after a step (`quiet()`, `submit()`) can outlast under
 * load, and then a wait for it on the screen would never end.
 *
 * Which toasts count: each once, and only those shown since the step began. A step begins with
 * the page's document, each test (`useApp()`'s `afterEach`), and `submit()` and
 * `expectingErrors()`; `markToasts()` begins one by hand.
 */
import type { BrowserContext, ElementHandle, Page } from "playwright";

interface ShownToast {
	/** Its texts as it showed them (a toast can change, e.g. a promise's), whitespace collapsed. */
	texts: string[];
	/** svelte-sonner's type: `success`, `error`, `loading`… */
	type: string;
	/** When it showed, in the page's `performance.now()`. */
	at: number;
	/** A test has found it. */
	found: boolean;
}

interface ToastLog {
	shown: ShownToast[];
	/** The toasts' elements, by their place in `shown`. */
	elements: Element[];
	/** Where the current step's toasts start in `shown`. */
	from: number;
}

declare global {
	interface Window {
		__e2eToasts?: ToastLog;
	}
}

/** Runs in each document of the context's pages, before the app: records its toasts. */
function recorder() {
	const log: ToastLog = { shown: [], elements: [], from: 0 };
	window.__e2eToasts = log;
	const records = new WeakMap<Element, ShownToast>();
	const toastSelector = "[data-sonner-toast]";
	const scan = () => {
		for (const element of document.querySelectorAll(toastSelector)) {
			let toast = records.get(element);
			if (!toast) {
				toast = { texts: [], type: "", at: performance.now(), found: false };
				records.set(element, toast);
				log.shown.push(toast);
				log.elements.push(element);
			}
			toast.type = element.getAttribute("data-type") ?? "";
			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
			if (text && toast.texts.at(-1) !== text) toast.texts.push(text);
		}
	};
	/** Whether a change is in a toaster, or adds one: the rest of the page's changes don't count. */
	const concernsToasts = (record: MutationRecord) => {
		const target = record.target instanceof Element ? record.target : record.target.parentElement;
		if (target?.closest("[data-sonner-toaster]")) return true;
		return [...record.addedNodes].some(
			(node) =>
				node instanceof Element &&
				(node.matches(toastSelector) || !!node.querySelector(toastSelector)),
		);
	};
	new MutationObserver((changes) => {
		if (changes.some(concernsToasts)) scan();
	}).observe(document, { childList: true, subtree: true, characterData: true });
}

const recording = new WeakSet<BrowserContext>();

/** Records the toasts of every page of `context` (`newContext()` does, for every context). */
export async function recordToasts(context: BrowserContext) {
	if (recording.has(context)) return;
	recording.add(context);
	await context.addInitScript(recorder);
}

/** Begins a step: the toasts shown so far no longer count. */
export async function markToasts(page: Page) {
	await page
		.evaluate(() => {
			const log = window.__e2eToasts;
			if (log) log.from = log.shown.length;
		})
		// A document on its way out: the next one's log starts empty anyway.
		.catch(() => {});
}

/**
 * Waits for a toast with all of `texts` (case aside, as Playwright's `hasText`) shown since the
 * step began and not found before, on the screen or already gone, and counts it as found. Its
 * element, still on the screen or not.
 */
export async function findToast(page: Page, texts: string[]): Promise<ElementHandle<Element>> {
	const handle = await page.waitForFunction(
		(wanted) => {
			const log = window.__e2eToasts;
			// None in a document that's still loading.
			if (!log) return undefined;
			const lower = wanted.map((text) => text.replace(/\s+/g, " ").trim().toLowerCase());
			for (let i = log.from; i < log.shown.length; i++) {
				const toast = log.shown[i];
				const matches = toast.texts.some((text) =>
					lower.every((part) => text.toLowerCase().includes(part)),
				);
				if (!toast.found && matches) {
					toast.found = true;
					return log.elements[i];
				}
			}
			return undefined;
		},
		texts,
		// Every 100 ms rather than every frame, as a page that draws no frames for a while would hold
		// the wait up (see `submit()`).
		{ polling: 100 },
	);
	return handle.asElement()!;
}
