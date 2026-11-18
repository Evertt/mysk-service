/**
 * Who may read and change the maintenance module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). Plans and settings are the office's; the settings are a manager's to change
 * (any member changes a plan). A customer's contact reads the plans of the units they see, for when
 * a site's units are next due (the site report, `site-summary.ts`); an engineer reads none.
 */
import { and, eq, sql } from "drizzle-orm";

import { type AccessRule, rows, tenantWide } from "#lib/server/access/rules.ts";
import { customerEquipment, inTenant } from "#lib/server/auth/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import type { maintenanceSubjects } from "../activity.ts";
import { maintenancePlan } from "./schema.ts";

export const maintenanceAccess = {
	maintenancePlan: rows(maintenancePlan, maintenancePlan.id, {
		office: true,
		customer: ({ access }) =>
			and(
				inTenant(maintenancePlan),
				sql`exists (select 1 from ${equipment} where ${and(
					eq(equipment.id, maintenancePlan.equipmentId),
					customerEquipment(access),
				)})`,
			)!,
	}),
	maintenance_settings: tenantWide({ office: true }, { change: "manager" }),
} satisfies Record<keyof typeof maintenanceSubjects, AccessRule>;
