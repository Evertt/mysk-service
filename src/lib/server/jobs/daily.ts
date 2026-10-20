/**
 * The daily run: once a day, each organization's modules do their daily work in it (the
 * `jobs.daily` point, `#lib/jobs/extensions.ts`), as the system (`asSystem()`). One entry point
 * for every target, always inside a request, where the database and the request's helpers are:
 *
 * - On Node (Vercel, a server of your own): a cron calls `GET` or `POST /_ops/daily` with
 *   `Authorization: Bearer <CRON_SECRET or OPS_TOKEN>` (`src/routes/_ops/daily/+server.ts`):
 *   Vercel Cron does it with `vercel.json`'s schedule and sends its `CRON_SECRET` itself.
 * - On Cloudflare: the Worker's Cron Trigger (`wrangler.jsonc`) has the Durable Object answer that
 *   same request (`scheduled()` in `cloudflare/entry.ts`), with the `OPS_TOKEN`.
 *
 * Running it more than once a day does no harm: each job does nothing twice (maintenance, for
 * one, skips a plan whose last order is still open).
 */
import { timingSafeEqual } from "node:crypto";

import { CRON_SECRET, OPS_TOKEN } from "$app/env/private";

import { currentDay } from "#lib/dates.ts";
import { daily, type DailyReport } from "#lib/jobs/extensions.ts";
import { asSystem, tenantOf } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { organization } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

/** What the run did in an organization: its modules' reports, merged. */
export interface DailyResult {
	/** The organization's id and slug. */
	organization: { id: string; slug: string };
	report: DailyReport;
}

/**
 * Runs the daily jobs of every organization, one after another, for `today` (by default the
 * run's: the server's time zone, as a cron's request has no user's). Each organization's modules
 * are those it has on, as for its members; a job that fails is logged and the others go on.
 */
export async function runDaily(today = currentDay()): Promise<DailyResult[]> {
	const organizations = await db
		.select({ id: organization.id })
		.from(organization)
		.orderBy(organization.createdAt);
	const results: DailyResult[] = [];
	for (const { id } of organizations) {
		// The system has no role: it's no member, and only the jobs run as it.
		const tenant = await tenantOf(id, { roles: [] });
		if (!tenant) continue;
		const reports = await asSystem(tenant, () => collect(daily, { today }, tenant.modules));
		results.push({
			organization: { id, slug: tenant.slug },
			report: Object.assign({}, ...reports) as DailyReport,
		});
	}
	return results;
}

/** Whether `header` is `Bearer <token>`, compared in constant time. */
function bearer(header: string, token: string | undefined) {
	if (!token) return false;
	const given = new TextEncoder().encode(header);
	const wanted = new TextEncoder().encode(`Bearer ${token}`);
	return given.byteLength === wanted.byteLength && timingSafeEqual(given, wanted);
}

/**
 * Whether `request` may start the daily run: it carries `CRON_SECRET` (Vercel Cron sends it) or
 * `OPS_TOKEN` (Cloudflare's Cron Trigger, `cloudflare/entry.ts`). Never without one of them set.
 */
export function mayRunDaily(request: Request) {
	const header = request.headers.get("authorization") ?? "";
	return bearer(header, CRON_SECRET) || bearer(header, OPS_TOKEN);
}
