/**
 * Who may read and change the condition module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). A unit's condition and its components are parts of the unit: the office reads
 * them with it, a customer's contact on the units they see (the attention card), and an engineer
 * only on a unit that is on one of their own orders (the card in the field checklist), narrower than
 * the units they read otherwise. The thresholds are the office's, and a manager's to change.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { type AccessRule, partOf, tenantWide } from "#lib/server/access/rules.ts";
import { engineerOrders, inTenant } from "#lib/server/auth/index.ts";
import { order, orderUnit } from "#lib/server/db/schema.ts";

import type { conditionSubjects } from "../activity.ts";
import { component, unitCondition } from "./schema.ts";

/** The unit `equipmentId` is on one of the signed-in engineer's orders. */
const onTheirOrders = async (equipmentId: SQLiteColumn): Promise<SQL> =>
	sql`exists (select 1 from ${orderUnit} inner join ${order} on ${and(
		eq(order.id, orderUnit.orderId),
		inTenant(order),
	)} where ${and(eq(orderUnit.equipmentId, equipmentId), inTenant(orderUnit), await engineerOrders())})`;

export const conditionAccess = {
	unitCondition: partOf("equipment", unitCondition, unitCondition.equipmentId, {
		engineer: () => onTheirOrders(unitCondition.equipmentId),
	}),
	component: partOf("equipment", component, component.equipmentId, {
		engineer: () => onTheirOrders(component.equipmentId),
	}),
	condition_settings: tenantWide({ office: true }, { change: "manager" }),
} satisfies Record<keyof typeof conditionSubjects, AccessRule>;
