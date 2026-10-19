import type { RequestHandler } from "@sveltejs/kit";

import { receiveBugReport } from "#lib/server/bug-reports/upload.ts";

/**
 * Takes a bug report from the record button (`#lib/bug-reports/recorder.svelte.ts`); gated by
 * `requireReporter()` (an office member or a field engineer), which `receiveBugReport()` runs first.
 *
 * An endpoint rather than a remote `form`: the recorder sends what it recorded from script, not
 * from a form the user submits, and an endpoint can refuse a report over the limit by its
 * `Content-Length` before reading a byte of it. Neither has a body limit of SvelteKit's own; the
 * platform's are the Worker's 100 MB on Cloudflare (well over the 20 MB a report may have), Node
 * adapter's `BODY_SIZE_LIMIT` (512 KB unless set: set it above 20 MB where the app runs on
 * `adapter-node`), and Vercel's 4.5 MB per function request, which a long recording can pass.
 */
export const POST: RequestHandler = ({ request }) => receiveBugReport(request);
