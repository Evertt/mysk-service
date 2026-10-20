/**
 * The integration tokens of a module with integration endpoints (`integrationModules`), on its
 * settings page (`<IntegrationTokensCard>`): made and revoked through
 * `#lib/server/auth/integrations.ts`, which stores only their hashes, so a token's first
 * characters are all anyone sees again. Every member reads them; only managers make and revoke
 * them; a tenant without the module gets a 404 (`requireModule()`, before anything is read).
 */
import * as v from "valibot";

import { integrationModules } from "#lib/modules/manifests.ts";
import { requireModule } from "#lib/server/auth/index.ts";
import {
	integrationTokens,
	issueIntegrationToken,
	revokeIntegrationToken as revokeToken,
} from "#lib/server/auth/integrations.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

const moduleId = v.picklist(integrationModules);

/** The module's tokens, newest first, revoked ones too. */
export const getIntegrationTokens = forMembers.query(moduleId, (module) => {
	requireModule(module);
	return integrationTokens(module);
});

/** Makes a token for the module: answers it, the one time it's shown. */
export const createIntegrationToken = forManagers.form(
	v.object({
		module: moduleId,
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(m.common_token_name_required), v.maxLength(80)),
	}),
	({ module, name }) => {
		requireModule(module);
		return issueIntegrationToken(module, name).then((made) => {
			void getIntegrationTokens(module).refresh();
			return made;
		});
	},
);

/** Revokes one of the module's tokens: what posted with it can't any more. */
export const revokeIntegrationToken = forManagers.form(
	v.object({
		module: moduleId,
		id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
	}),
	({ module, id }) => {
		requireModule(module);
		return revokeToken(module, id).then(() => void getIntegrationTokens(module).refresh());
	},
);
