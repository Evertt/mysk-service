/**
 * The worker SvelteKit's `adapter-cloudflare` writes (`.svelte-kit/cloudflare/_worker.js`), as
 * `cloudflare/entry.ts` imports it: `#kit-worker` in `package.json`'s `imports`, whose `types` are
 * this file, so the entry type-checks without a Cloudflare build (CI has none).
 */
declare const worker: {
	fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};
export default worker;
