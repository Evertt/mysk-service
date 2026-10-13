/**
 * What the service worker experiment uses of SvelteKit's client runtime (aliased in
 * `vite.config.ts`; internal, so typed here by hand).
 */
declare module "$kit-client" {
	/** The page's active queries, by remote function id (`<file hash>/<name>`) and payload. */
	export const query_map: Map<string, Map<string, { resource: { refresh(): Promise<void> } }>>;
}
