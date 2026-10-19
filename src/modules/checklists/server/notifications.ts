/**
 * The checklists' notifications (`notifications.rules`): the office hears of a checklist completed
 * with rejected points (field progress), which its order's work may need. A completed checklist is
 * on record and its results don't change, so its rejected points now are those it was completed
 * with.
 */
import { and, eq, sql } from "drizzle-orm";

import type { NotificationRule } from "#lib/notifications/extensions.ts";
import { db } from "#lib/server/db/index.ts";
import { literal } from "#lib/server/db/parameters.ts";
import { activity } from "#lib/server/db/schema.ts";
import { entryAbout, subjectNumber } from "#lib/server/notifications/index.ts";

import { checklistResult } from "./schema.ts";

/** A rejected point of the entry's checklist (built per request: `db` is the request's). */
const rejectedPoint = () =>
	db
		.select({ id: checklistResult.id })
		.from(checklistResult)
		.where(
			and(
				eq(checklistResult.checklistId, subjectNumber),
				eq(checklistResult.organizationId, activity.organizationId),
				eq(checklistResult.result, literal("nok")),
			),
		);

export const checklistNotificationRules = (): NotificationRule[] => [
	{
		id: "checklists.rejected",
		audience: "office",
		category: "field",
		where: () => and(entryAbout("checklist", ["completed"]), sql`exists ${rejectedPoint()}`)!,
	},
];
