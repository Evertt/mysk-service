import { getRequestEvent } from "$app/server";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { isManager, parseRoles } from "#lib/auth";
import { modules } from "#lib/modules/manifests.ts";
import { recordActivity } from "#lib/server/activity";
import { currentTenant, inTenant } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { member, organizationModule, user } from "#lib/server/db/schema.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

import { getCurrentTenant } from "../session.remote.ts";

export const getOrganizationSettings = forMembers.query(async () => {
	const tenant = currentTenant();
	const [members, enabled] = await Promise.all([
		db
			.select({ id: member.id, name: user.name, email: user.email, role: member.role })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(inTenant(member))
			.orderBy(asc(user.name)),
		db
			.select({ moduleId: organizationModule.moduleId, enabledAt: organizationModule.enabledAt })
			.from(organizationModule)
			.where(inTenant(organizationModule)),
	]);
	const enabledAt = new Map(enabled.map((row) => [row.moduleId, row.enabledAt]));
	return {
		name: tenant.name,
		canManage: isManager(tenant.roles),
		members: members.map((m) => ({ ...m, roles: parseRoles(m.role) })),
		modules: modules.map(({ id, label, description }) => ({
			id,
			label,
			description,
			enabledAt: enabledAt.get(id) ?? null,
		})),
	};
});

export const setModule = forManagers.form(
	v.object({
		moduleId: v.picklist(modules.map((m) => m.id)),
		enabled: v.picklist(["on", "off"]),
	}),
	async ({ moduleId, enabled }) => {
		const { organizationId } = currentTenant();
		await db.transaction(async (tx) => {
			const changed =
				enabled === "on"
					? await tx
							.insert(organizationModule)
							.values({ organizationId, moduleId })
							.onConflictDoNothing()
							.returning()
					: await tx
							.delete(organizationModule)
							.where(and(inTenant(organizationModule), eq(organizationModule.moduleId, moduleId)))
							.returning();
			// Only a change of state: enabling an enabled module changes nothing.
			if (!changed.length) return;
			const label = modules.find((m) => m.id === moduleId)?.label ?? moduleId;
			const action = enabled === "on" ? "module_enabled" : "module_disabled";
			await recordActivity(tx, { action, subject: { type: "module", id: moduleId, label } });
		});
		// The tenant was loaded at the start of this request; bring it up to date before the
		// sidebar's query is refreshed with it.
		const { tenant } = getRequestEvent().locals;
		if (tenant) {
			tenant.modules =
				enabled === "on"
					? [...new Set([...tenant.modules, moduleId])]
					: tenant.modules.filter((id) => id !== moduleId);
		}
		void getOrganizationSettings().refresh();
		void getCurrentTenant().refresh();
	},
);
