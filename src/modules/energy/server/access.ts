/**
 * Who may read and change the energy module's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The office reads them all; a customer's contact reads their own sites' figures
 * in the portal, so the site, its zones (with their thresholds) and its doors, at the sites they
 * see; the consumers and the alerts are the office's. The setup (a site, its zones, consumers,
 * doors and thresholds) is a manager's to change; alerts are ordered and resolved by any member.
 */
import { and, sql } from "drizzle-orm";

import { type AccessRule, partOf, rows } from "#lib/server/access/rules.ts";
import { atSites, inTenant, ofCustomer } from "#lib/server/auth/index.ts";
import { customerSite } from "#lib/server/db/schema.ts";

import type { energySubjects } from "../activity.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energySite,
	energyThreshold,
	energyZone,
} from "./schema.ts";

type Access = Parameters<typeof ofCustomer>[0];

/** The energy sites a contact sees: those at their customer's sites they see (as the portal reads). */
const sitesOf = (access: Access) =>
	and(
		inTenant(energySite),
		sql`${energySite.siteId} in (select ${customerSite.id} from ${customerSite} where ${and(
			ofCustomer(access, customerSite),
			atSites(access, customerSite.id),
		)})`,
	)!;

export const energyAccess = {
	energy_site: rows(
		energySite,
		energySite.id,
		{ office: true, customer: ({ access }) => sitesOf(access) },
		{ change: "manager" },
	),
	energy_zone: partOf("energy_site", energyZone, energyZone.energySiteId),
	energy_door: partOf("energy_site", energyDoor, energyDoor.energySiteId),
	// A zone's thresholds are the zone's, by the zone's id: the portal's zones show them.
	energy_threshold: rows(
		energyThreshold,
		energyThreshold.zoneId,
		{
			office: true,
			customer: ({ access }) =>
				and(
					inTenant(energyThreshold),
					sql`${energyThreshold.zoneId} in (select ${energyZone.id} from ${energyZone} where ${energyZone.energySiteId} in (select ${energySite.id} from ${energySite} where ${sitesOf(access)}))`,
				),
		},
		{ change: "manager" },
	),
	energy_consumer: rows(energyConsumer, energyConsumer.id, { office: true }, { change: "manager" }),
	energy_alert: rows(energyAlert, energyAlert.id, { office: true }),
} satisfies Record<keyof typeof energySubjects, AccessRule>;
