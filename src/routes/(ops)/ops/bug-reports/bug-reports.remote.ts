import { error } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { db } from "#lib/server/db/index.ts";
import { bugReport } from "#lib/server/db/schema.ts";
import { forDevelopers } from "#lib/server/remote-functions.ts";

/** How many of the newest reports the list shows (deleting old ones is a follow-up). */
const listed = 500;

/** The path of `url`, or `url` itself if it isn't one. */
function pathOf(url: string) {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

/**
 * The bug reports, newest first, across tenants: `bug_report` is the platform's table, not a
 * tenant's (see its comment in the schema), and only the developers read it.
 */
export const getBugReports = forDevelopers.query(async () => {
	const rows = await db
		.select({
			id: bugReport.id,
			userName: bugReport.userName,
			url: bugReport.url,
			note: bugReport.note,
			context: bugReport.context,
			createdAt: bugReport.createdAt,
		})
		.from(bugReport)
		.orderBy(desc(bugReport.createdAt), desc(bugReport.startedAt))
		.limit(listed);
	return rows.map(({ context, ...row }) => ({
		...row,
		path: pathOf(row.url),
		organization: context.organization.name,
	}));
});

/** One bug report, for its replay page; a 404 if there's none. */
export const getBugReport = forDevelopers.query(v.string(), async (id) => {
	const [row] = await db
		.select({
			id: bugReport.id,
			userName: bugReport.userName,
			note: bugReport.note,
			context: bugReport.context,
			startedAt: bugReport.startedAt,
			durationMs: bugReport.durationMs,
			size: bugReport.size,
			createdAt: bugReport.createdAt,
		})
		.from(bugReport)
		.where(eq(bugReport.id, id));
	if (!row) error(404, m.common_error_not_found());
	return row;
});
