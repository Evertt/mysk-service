/**
 * Who may read and change the docks module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The docks are the office's (the board and a customer's page), and a manager's
 * to change; no portal reads them.
 */
import { type AccessRule, rows } from "#lib/server/access/rules.ts";

import type { dockSubjects } from "../activity.ts";
import { dockPosition } from "./schema.ts";

export const dockAccess = {
	dock: rows(dockPosition, dockPosition.id, { office: true }, { change: "manager" }),
} satisfies Record<keyof typeof dockSubjects, AccessRule>;
