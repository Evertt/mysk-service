/**
 * Integration tokens: how a system outside the app posts data to a module's integration endpoints
 * (the `+server.ts` files in a module's `(api)` routes, e.g. the docks module's Salvo event feed at
 * `/docks/ingest`), with `Authorization: Bearer <token>` instead of a session. A token belongs to a
 * tenant and one module; managers make and revoke them on the module's settings page (through the
 * module's own manager-only remote functions, which call these). Only the token's hash is stored:
 * it's shown once, when it's made.
 *
 * The route stub of such an endpoint guards it with `guardedIntegration()`
 * (`#lib/server/modules/hooks.ts`), which finds the token's tenant here (`integrationTenant()`)
 * and runs the handler as the system in it (`asSystem()`), so the handler's queries, transactions
 * and log entries work as in a member's request. `hooks.server.ts` lets requests to `(api)` routes
 * through without a session for that.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq, isNull } from "drizzle-orm";

import { effectiveModules } from "#lib/modules/graph.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { db } from "#lib/server/db/index.ts";
import { integrationToken, organization, organizationModule, user } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { currentTenant, idInTenant, inTenant, type Tenant } from "./session.ts";
import { isSystemUser } from "./system.ts";

/** Every token starts with this, so it's recognised (in a leaked file, say). */
const tokenPrefix = "fwi_";

/** How many of a token's characters are kept to tell it apart: the prefix and four more. */
const shownLength = tokenPrefix.length + 4;

/** A new token: the prefix and 160 random bits in hex. */
function newIntegrationToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	return tokenPrefix + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A token's SHA-256, in hex: what's stored and looked up. */
async function hashIntegrationToken(token: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The tenant's tokens for `moduleId`, newest first, revoked ones too. */
export function integrationTokens(moduleId: ModuleId) {
	return db
		.select({
			id: integrationToken.id,
			name: integrationToken.name,
			prefix: integrationToken.prefix,
			createdBy: user.name,
			createdAt: integrationToken.createdAt,
			lastUsedAt: integrationToken.lastUsedAt,
			revokedAt: integrationToken.revokedAt,
		})
		.from(integrationToken)
		.leftJoin(user, eq(user.id, integrationToken.createdBy))
		.where(and(inTenant(integrationToken), eq(integrationToken.moduleId, moduleId)))
		.orderBy(desc(integrationToken.id));
}

const moduleParent = (moduleId: ModuleId): Subject => ({
	type: "module",
	id: moduleId,
	label: moduleId,
});

/**
 * Makes a token for the tenant's `moduleId`, named `name`, and logs it. Answers the token itself,
 * which is never shown again.
 */
export async function issueIntegrationToken(moduleId: ModuleId, name: string) {
	const { organizationId, user: by } = currentTenant();
	const token = newIntegrationToken();
	const tokenHash = await hashIntegrationToken(token);
	const prefix = token.slice(0, shownLength);
	await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(integrationToken)
			.values({
				organizationId,
				moduleId,
				name,
				tokenHash,
				prefix,
				// The system is no row of the user table.
				createdBy: isSystemUser(by) ? null : by.id,
			})
			.returning({ id: integrationToken.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "integration_token", id: row.id, label: name },
			parent: moduleParent(moduleId),
			after: { name, prefix },
		});
	});
	return { token, prefix };
}

/** Revokes the tenant's token `id` for `moduleId`; a 404 if it has none such that's still valid. */
export async function revokeIntegrationToken(moduleId: ModuleId, id: number) {
	await db.transaction(async (tx) => {
		const revoked = orNotFound(
			await tx
				.update(integrationToken)
				.set({ revokedAt: Temporal.Now.instant() })
				.where(
					and(
						idInTenant(integrationToken, id),
						eq(integrationToken.moduleId, moduleId),
						isNull(integrationToken.revokedAt),
					),
				)
				.returning({ name: integrationToken.name }),
			m.common_error_not_found(),
		);
		await recordActivity(tx, {
			action: "revoked",
			subject: { type: "integration_token", id, label: revoked.name },
			parent: moduleParent(moduleId),
		});
	});
}

/** The token in `request`'s `Authorization: Bearer …` header, if it has one. */
function bearerToken(request: Request) {
	const header = request.headers.get("authorization") ?? "";
	const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
	return match?.[1];
}

/**
 * The tenant that `request`'s token is for, if it's a valid token of `moduleId`'s and the tenant
 * has the module on. A missing, unknown or revoked token (or one of another module's) is a 401; a
 * tenant without the module (anymore) gets a 404, as if the endpoint weren't there. Notes when the
 * token was used, at most once a minute.
 */
export async function integrationTenant(request: Request, moduleId: ModuleId): Promise<Tenant> {
	const token = bearerToken(request);
	if (!token?.startsWith(tokenPrefix)) error(401, m.common_error_invalid_token());
	const [found] = await db
		.select({
			id: integrationToken.id,
			organizationId: integrationToken.organizationId,
			lastUsedAt: integrationToken.lastUsedAt,
			name: organization.name,
			slug: organization.slug,
		})
		.from(integrationToken)
		.innerJoin(organization, eq(organization.id, integrationToken.organizationId))
		.where(
			and(
				eq(integrationToken.tokenHash, await hashIntegrationToken(token)),
				eq(integrationToken.moduleId, moduleId),
				isNull(integrationToken.revokedAt),
			),
		);
	if (!found) error(401, m.common_error_invalid_token());

	const stored = await db
		.select({ id: organizationModule.moduleId })
		.from(organizationModule)
		.where(eq(organizationModule.organizationId, found.organizationId));
	const modules = effectiveModules(stored.map((row) => row.id));
	if (!modules.includes(moduleId)) error(404, m.common_error_not_found());

	const now = Temporal.Now.instant();
	if (!found.lastUsedAt || found.lastUsedAt.until(now).total("seconds") >= 60) {
		await db
			.update(integrationToken)
			.set({ lastUsedAt: now })
			.where(
				and(
					eq(integrationToken.organizationId, found.organizationId),
					eq(integrationToken.id, found.id),
				),
			);
	}
	// The system has no role: it's no member, and only the endpoint's handler runs as it.
	return {
		organizationId: found.organizationId,
		name: found.name,
		slug: found.slug,
		roles: [],
		modules,
	};
}
