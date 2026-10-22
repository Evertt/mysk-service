/**
 * Who may read and change the materials module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The materials are the office's; an engineer picks from them (the portal's list
 * of usable materials). An order's line is logged under its material's id, with its order only as
 * the parent (`activity.ts`), so the subject doesn't say which order's line it is: a rule that let
 * an engineer read the lines of their own orders would let them read that material's line on every
 * order. Only the office reads and changes `order_line`; an engineer sees their orders' lines
 * through the order. A customer's contact sees neither.
 */
import { type AccessRule, rows } from "#lib/server/access/rules.ts";

import type { materialSubjects } from "../activity.ts";
import { material, orderLine } from "./schema.ts";

export const materialAccess = {
	material: rows(material, material.id, { office: true, engineer: true }),
	order_line: rows(orderLine, orderLine.materialId, { office: true }),
} satisfies Record<keyof typeof materialSubjects, AccessRule>;
