/**
 * The integration tokens of every module with integration endpoints (`integration-tokens.remote.ts`),
 * on the seeded demo database: a manager makes one (shown once, stored as its hash) and revokes it,
 * which a planner may only see by its first characters; a tenant without the module gets a 404,
 * and another tenant's token can't be revoked, also by its id. What the endpoints do with a token
 * is their feed specs' (`docks`, `energy`).
 */
import { describe, expect, test } from "vite-plus/test";

import { integrationModules } from "#lib/modules/manifests.ts";
import {
	createIntegrationToken,
	getIntegrationTokens,
	revokeIntegrationToken,
} from "#lib/modules/settings/integration-tokens.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	shltr,
	submit,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

describe.each(integrationModules)("%s's tokens", (module) => {
	test("a manager makes one, shown once and stored as its hash, and revokes it", async () => {
		const name = `Spec ${module}`;
		const made = await as(shltr.owner, () => submit(createIntegrationToken, { module, name }));
		expect(made.status).toBe(200);
		expect(made.refreshed).toContain("getIntegrationTokens");
		const { token } = made.data as { token: string };
		expect(token).toMatch(/^fwi_[0-9a-f]{40}$/);
		const [stored] = await rows<{ id: number; token_hash: string; prefix: string }>(
			`select id, token_hash, prefix from integration_token
			 where organization_id = ? and module_id = ? and name = ?`,
			[shltrId, module, name],
		);
		expect(stored.token_hash).not.toContain(token.slice(4));
		expect(token.startsWith(stored.prefix)).toBe(true);
		const listed = await as(shltr.owner, () => data(getIntegrationTokens, module));
		expect(listed.canManage).toBe(true);
		expect(JSON.stringify(listed.tokens)).not.toContain(token);

		const revoked = await as(shltr.owner, () =>
			submit(revokeIntegrationToken, { module, id: String(stored.id) }),
		);
		expect(revoked.status).toBe(200);
		expect(
			await rows(`select revoked_at is not null as revoked from integration_token where id = ?`, [
				stored.id,
			]),
		).toEqual([{ revoked: 1 }]);
	});

	test("are a planner's to see, by their first characters, but not to make or revoke", async () => {
		const [demo] = await rows<{ id: number; revoked_at: number | null }>(
			`select id, revoked_at from integration_token where organization_id = ? and module_id = ?
			 order by id limit 1`,
			[shltrId, module],
		);
		await as(shltr.member, async () => {
			const settings = await data(getIntegrationTokens, module);
			expect(settings.canManage).toBe(false);
			expect(settings.tokens.map((token) => token.id)).toContain(demo.id);
			expect(Object.keys(settings.tokens[0]).toSorted()).toEqual(
				["createdAt", "createdBy", "id", "lastUsedAt", "name", "prefix", "revokedAt"].toSorted(),
			);
			expect(await submit(createIntegrationToken, { module, name: "Planner's" })).toMatchObject({
				status: 403,
			});
			expect(await submit(revokeIntegrationToken, { module, id: String(demo.id) })).toMatchObject({
				status: 403,
			});
		});
		expect(await rows(`select revoked_at from integration_token where id = ?`, [demo.id])).toEqual([
			{ revoked_at: demo.revoked_at },
		]);
	});

	test("are a 404 for a tenant without the module, and another tenant's can't be revoked", async () => {
		const [demo] = await rows<{ id: number }>(
			`select id from integration_token where organization_id = ? and module_id = ?
			 and revoked_at is null order by id limit 1`,
			[shltrId, module],
		);
		// North hasn't the module: as if it weren't there.
		await as(north.owner, async () => {
			expect(await call(getIntegrationTokens, module)).toMatchObject({ status: 404 });
			expect(await submit(createIntegrationToken, { module, name: "North's" })).toMatchObject({
				status: 404,
			});
		});
		// With it, SHLTR's token is still none of North's: not listed, and not revoked by its id.
		await rows(`insert into organization_module (organization_id, module_id) values (?, ?)`, [
			organizationId("north"),
			module,
		]);
		try {
			await as(north.owner, async () => {
				const listed = await data(getIntegrationTokens, module);
				expect(listed.tokens.map((token) => token.id)).not.toContain(demo.id);
				expect(await submit(revokeIntegrationToken, { module, id: String(demo.id) })).toMatchObject(
					{ status: 404 },
				);
			});
		} finally {
			await rows(`delete from organization_module where organization_id = ? and module_id = ?`, [
				organizationId("north"),
				module,
			]);
		}
		expect(await rows(`select revoked_at from integration_token where id = ?`, [demo.id])).toEqual([
			{ revoked_at: null },
		]);
	});

	test("refuse a module without integration endpoints", async () => {
		await as(shltr.owner, async () => {
			expect(await call(getIntegrationTokens, "contracts" as never)).toMatchObject({
				status: 400,
			});
		});
	});
});
