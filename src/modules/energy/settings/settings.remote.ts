/**
 * The module's settings page (`/energy/settings`): the integration tokens the sites' gateways post
 * with (made and revoked through the core's `#lib/server/auth/integrations.ts`, which stores only
 * their hashes, so a token's first characters are all anyone sees again), and the sites with the
 * codes a gateway names. Every member may read them; only managers make and revoke tokens.
 */
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import {
	integrationTokens,
	issueIntegrationToken,
	revokeIntegrationToken,
} from "#lib/server/auth/integrations.ts";
import { currentTenant } from "#lib/server/auth/session.ts";

import { forManagers, query } from "../remote-functions.ts";
import { ingestSites } from "../server/ingest.ts";

/**
 * The tokens (newest first, revoked ones too), the sites with their codes, and whether the user
 * may change them.
 */
export const getEnergySettings = query(async () => {
	const [tokens, sites] = await Promise.all([integrationTokens("energy"), ingestSites()]);
	return { tokens, sites, canManage: isManager(currentTenant().roles) };
});

/** Makes a token: answers it, the one time it's shown. */
export const createEnergyToken = forManagers.form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(m.energy_token_name_required), v.maxLength(80)),
	}),
	async ({ name }) => {
		const made = await issueIntegrationToken("energy", name);
		void getEnergySettings().refresh();
		return made;
	},
);

/** Revokes a token: the gateway can't post with it any more. */
export const revokeEnergyToken = forManagers.form(
	v.object({ id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) }),
	async ({ id }) => {
		await revokeIntegrationToken("energy", id);
		void getEnergySettings().refresh();
	},
);
