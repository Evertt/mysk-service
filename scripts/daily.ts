/**
 * Starts the running app's daily jobs (`pnpm jobs:daily`), for a server of your own: call it from
 * cron, e.g. `0 4 * * * cd /srv/fieldworks && pnpm jobs:daily`. It asks the app at `ORIGIN` (or
 * the first argument) through `POST /_ops/daily` with `CRON_SECRET` or `OPS_TOKEN`, as Vercel Cron
 * and Cloudflare's Cron Trigger do (see `src/lib/server/jobs/daily.ts`), and prints what they did.
 */
const origin = process.argv[2] ?? process.env.ORIGIN;
const token = process.env.CRON_SECRET || process.env.OPS_TOKEN;
if (!origin || !token) {
	console.error("Set ORIGIN (or pass the app's URL) and CRON_SECRET or OPS_TOKEN.");
	process.exit(1);
}

const response = await fetch(new URL("/_ops/daily", origin), {
	method: "POST",
	// JSON, not a form: SvelteKit refuses a cross-site POST without a content type (CSRF).
	headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
	body: "{}",
});
console.info(await response.text());
if (!response.ok) process.exitCode = 1;
