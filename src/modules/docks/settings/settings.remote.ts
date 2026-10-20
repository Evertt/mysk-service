/**
 * The module's settings page (`/docks/settings`): the Salvo feed's integration tokens (made and
 * revoked through the core's `#lib/server/auth/integrations.ts`, which stores only their hashes, so
 * a token's first characters are all anyone sees again) and the tenant's docks, which are kept on
 * their customers' pages. Every member may read them; only managers make and revoke tokens.
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
import { allDocks } from "../server/docks.ts";

/** The tokens (newest first, revoked ones too), the docks, and whether the user may change them. */
export const getDockSettings = query(async () => {
	const [tokens, docks] = await Promise.all([integrationTokens("docks"), allDocks()]);
	return { tokens, docks, canManage: isManager(currentTenant().roles) };
});

/** Makes a token: answers it, the one time it's shown. */
export const createDockToken = forManagers.form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(m.docks_token_name_required), v.maxLength(80)),
	}),
	async ({ name }) => {
		const made = await issueIntegrationToken("docks", name);
		void getDockSettings().refresh();
		return made;
	},
);

/** Revokes a token: the feed can't post with it any more. */
export const revokeDockToken = forManagers.form(
	v.object({ id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) }),
	async ({ id }) => {
		await revokeIntegrationToken("docks", id);
		void getDockSettings().refresh();
	},
);
