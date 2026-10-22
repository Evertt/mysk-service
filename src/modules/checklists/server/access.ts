/**
 * Who may read and change the checklists module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). A template and its points are the office's, and a manager's to change. A
 * unit's checklist on an order is a part of that order: the office reads it with the order, an
 * engineer on their own orders (and fills it in), and a customer's contact on theirs once it's
 * completed (a draft is the office's until then) and only for a unit they see: a checklist is of an
 * order and of one of its units, and a contact limited to some sites sees an order with units at
 * several of them only by those at theirs.
 */
import { and, eq, sql } from "drizzle-orm";

import { type AccessRule, partOf, rows } from "#lib/server/access/rules.ts";
import { customerEquipment } from "#lib/server/auth/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import type { checklistSubjects } from "../activity.ts";
import { checklist, checklistTemplate, checklistTemplateItem } from "./schema.ts";

export const checklistAccess = {
	checklistTemplate: rows(
		checklistTemplate,
		checklistTemplate.id,
		{ office: true },
		{ change: "manager" },
	),
	checklistTemplateItem: partOf(
		"checklistTemplate",
		checklistTemplateItem,
		checklistTemplateItem.templateId,
	),
	checklist: partOf("order", checklist, checklist.orderId, {
		customer: ({ access }) =>
			and(
				eq(checklist.status, "completed"),
				sql`exists (select 1 from ${equipment} where ${and(eq(equipment.id, checklist.equipmentId), customerEquipment(access))})`,
			)!,
	}),
} satisfies Record<keyof typeof checklistSubjects, AccessRule>;
