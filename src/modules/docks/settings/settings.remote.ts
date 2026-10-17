/**
 * The module's settings page (`/docks/settings`), for managers: the Salvo feed's integration
 * tokens (made and revoked through the core's `#lib/server/auth/integrations.ts`, which stores only
 * their hashes) and the tenant's docks, which are kept on their customers' pages.
 */
import * as v from "valibot";

import {
	integrationTokens,
	issueIntegrationToken,
	revokeIntegrationToken,
} from "#lib/server/auth/integrations.ts";

import { forManagers } from "../remote-functions.ts";
import { allDocks } from "../server/docks.ts";

/** The tokens (newest first, revoked ones too) and the docks. */
export const getDockSettings = forManagers.query(async () => {
	const [tokens, docks] = await Promise.all([integrationTokens("docks"), allDocks()]);
	return { tokens, docks };
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
