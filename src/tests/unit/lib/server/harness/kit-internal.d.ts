/**
 * The part of SvelteKit's internal server module the harness uses (`request.ts`), which SvelteKit
 * doesn't type: the request store that `getRequestEvent()` and the remote functions read. Internal,
 * so it may change in another SvelteKit version (3.0.0 here).
 */
declare module "@sveltejs/kit/internal/server" {
	import type { RequestEvent } from "@sveltejs/kit";

	/** Runs `fn` with `store` as the current request's (in an AsyncLocalStorage). */
	export function with_request_store<T>(
		store: { event: RequestEvent; state: object } | null,
		fn: () => T,
	): T;
}
