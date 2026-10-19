/**
 * Notes the page's requests while it's recorded: each remote function call and page data request,
 * with its name or path, status, duration and size, never its body. SvelteKit makes both with
 * `window.fetch` as it is when it calls (in a production build), so wrapping it finds them.
 */
import type { RecordedRequest } from "./events.ts";

/** What a request to `url` is, if it's one to note: a remote function's or a page's data. */
export function describeRequest(
	url: string,
	origin: string,
): Pick<RecordedRequest, "kind" | "name"> | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url, origin);
	} catch {
		return undefined;
	}
	if (parsed.origin !== origin) return undefined;
	const { pathname } = parsed;
	// `/_app/remote/<hash>/<name>`, and a prerendered one's payload after it, which this leaves out.
	const remote = /\/_app\/remote\/[^/]+\/([^/?]+)/.exec(pathname);
	if (remote) return { kind: "remote", name: decodeURIComponent(remote[1]) };
	if (pathname.endsWith("/__data.json")) {
		return { kind: "data", name: pathname.slice(0, -"/__data.json".length) || "/" };
	}
	return undefined;
}

/** The size a response says it has, if it says. */
function sizeOf(response: Response) {
	const length = response.headers.get("content-length");
	return length === null ? null : Number(length);
}

/**
 * Wraps `target.fetch` so each request to note is passed to `note` once answered (or failed);
 * answers a function that undoes it. Only `fetch` itself is changed: what it answers is untouched,
 * and a body is never read.
 */
export function trackRequests(
	note: (request: RecordedRequest) => void,
	target: { fetch: typeof fetch; location: { origin: string } } = window,
	now: () => number = () => performance.now(),
) {
	const original = target.fetch;
	let active = true;
	const tracking: typeof fetch = async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		const described = active ? describeRequest(url, target.location.origin) : undefined;
		if (!described) return original.call(target, input, init);
		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();
		const started = now();
		const done = (status: number | null, size: number | null) =>
			note({ ...described, method, status, durationMs: Math.round(now() - started), size });
		try {
			const response = await original.call(target, input, init);
			done(response.status, sizeOf(response));
			return response;
		} catch (error) {
			done(null, null);
			throw error;
		}
	};
	target.fetch = tracking;
	return () => {
		active = false;
		// Only if nothing wrapped it since: that wrapper would be lost. Else this one passes through.
		if (target.fetch === tracking) target.fetch = original;
	};
}
