/**
 * Who may read and change the maintenance module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). Plans and settings are the office's; the settings are a manager's to change
 * (any member changes a plan). No portal reads them.
 */
import { type AccessRule, rows, tenantWide } from "#lib/server/access/rules.ts";

import type { maintenanceSubjects } from "../activity.ts";
import { maintenancePlan } from "./schema.ts";

export const maintenanceAccess = {
	maintenancePlan: rows(maintenancePlan, maintenancePlan.id, { office: true }),
	maintenance_settings: tenantWide({ office: true }, { change: "manager" }),
} satisfies Record<keyof typeof maintenanceSubjects, AccessRule>;
