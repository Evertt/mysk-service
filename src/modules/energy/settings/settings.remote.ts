/**
 * The module's settings page (`/energy/settings`): the sites with the codes a gateway names. The
 * integration tokens the gateways post with are the core's (`<IntegrationTokensCard>`). Every
 * member may read them; only managers set a site up.
 */
import { isManager } from "#lib/auth/index.ts";
import { currentTenant } from "#lib/server/auth/session.ts";

import { query } from "../remote-functions.ts";
import { ingestSites } from "../server/ingest.ts";

/** The sites with their codes, and whether the user may set them up. */
export const getEnergySettings = query(async () => ({
	sites: await ingestSites(),
	canManage: isManager(currentTenant().roles),
}));
