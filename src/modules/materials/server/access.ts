/**
 * Who may read and change the materials module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The materials are the office's; an engineer picks from them (the portal's list
 * of usable materials) and uses them on their own orders. An order's line is logged under its
 * material's id, with its order as the parent (`activity.ts`), so its rule is that of the lines on
 * an order the audience reads: the office's on every order's, an engineer's on their own orders'.
 * A customer's contact sees neither.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";

import { type AccessRule, rows } from "#lib/server/access/rules.ts";
import { engineerOrders, inTenant } from "#lib/server/auth/index.ts";
import { order } from "#lib/server/db/schema.ts";

import type { materialSubjects } from "../activity.ts";
import { material, orderLine } from "./schema.ts";

/** The lines on one of the signed-in engineer's orders. */
const onTheirOrders = async (): Promise<SQL> =>
	and(
		inTenant(orderLine),
		sql`exists (select 1 from ${order} where ${and(eq(order.id, orderLine.orderId), await engineerOrders())})`,
	)!;

export const materialAccess = {
	material: rows(material, material.id, { office: true, engineer: true }),
	order_line: rows(
		orderLine,
		orderLine.materialId,
		{ office: true, engineer: onTheirOrders },
		{ change: { office: true, engineer: onTheirOrders } },
	),
} satisfies Record<keyof typeof materialSubjects, AccessRule>;
