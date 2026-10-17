/**
 * Integration tokens for the demo (see `#lib/server/auth/integrations.ts`): a module's seed gives
 * its demo tenant a known token, e.g. for a simulator to post with, through this. Stored as the app
 * stores them, by their SHA-256 and first characters. Demo data only: a real tenant's tokens are
 * random and shown once.
 */
import { createHash } from "node:crypto";

import { integrationToken } from "../schema.ts";
import type { SeedTransaction } from "./module-seed.ts";

export async function seedIntegrationToken(
	tx: SeedTransaction,
	token: {
		organizationId: string;
		moduleId: string;
		name: string;
		token: string;
		createdAt: Temporal.Instant;
	},
) {
	await tx.insert(integrationToken).values({
		organizationId: token.organizationId,
		moduleId: token.moduleId,
		name: token.name,
		tokenHash: createHash("sha256").update(token.token).digest("hex"),
		prefix: token.token.slice(0, 8),
		createdAt: token.createdAt,
	});
}
