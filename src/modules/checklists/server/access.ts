/**
 * Who may read and change the checklists module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). A template and its points are the office's, and a manager's to change. A
 * unit's checklist on an order is a part of that order: the office reads it with the order, an
 * engineer on their own orders (and fills it in), and a customer's contact on theirs once it's
 * completed (a draft is the office's until then).
 */
import { eq } from "drizzle-orm";

import { type AccessRule, partOf, rows } from "#lib/server/access/rules.ts";

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
		customer: () => eq(checklist.status, "completed"),
	}),
} satisfies Record<keyof typeof checklistSubjects, AccessRule>;
