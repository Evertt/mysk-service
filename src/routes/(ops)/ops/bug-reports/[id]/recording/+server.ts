import { type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import { requireDeveloper } from "#lib/server/bug-reports/developers.ts";
import { bugReportStore } from "#lib/server/bug-reports/storage.ts";
import { db } from "#lib/server/db/index.ts";
import { bugReport } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

/**
 * A bug report's recording, gzipped as it was sent, for its replay page to unpack: an endpoint,
 * as a query would pass its megabytes through devalue. As `application/gzip`, not as JSON with
 * `Content-Encoding: gzip`, which a platform may compress again or take off. For the developers
 * only (`requireDeveloper()`), a 404 for everyone else.
 */
export const GET: RequestHandler = async ({ params }) => {
	requireDeveloper();
	const [row] = await db
		.select({ objectKey: bugReport.objectKey })
		.from(bugReport)
		.where(eq(bugReport.id, params.id!));
	const recording = orNotFound(
		row && (await bugReportStore().get(row.objectKey)),
		m.common_error_not_found(),
	);
	return new Response(recording, {
		headers: {
			"content-type": "application/gzip",
			"cache-control": "private, max-age=31536000, immutable",
		},
	});
};
