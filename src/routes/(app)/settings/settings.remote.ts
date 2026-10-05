import { form, getRequestEvent, query } from "$app/server";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { modules } from "#lib/modules.js";
import { db } from "#lib/server/db/index.js";
import { member, organizationModule, user } from "#lib/server/db/schema.js";
import { requireMember, requireRole } from "#lib/server/session.js";

import { getCurrentTenant } from "../session.remote.js";

/** Roles that may manage the organization's settings. */
const managers = ["owner", "admin"];

export const getSettings = query(async () => {
	const tenant = requireMember();
	const [members, enabled] = await Promise.all([
		db
			.select({ id: member.id, name: user.name, email: user.email, role: member.role })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, tenant.organizationId))
			.orderBy(asc(user.name)),
		db
			.select({ moduleId: organizationModule.moduleId, enabledAt: organizationModule.enabledAt })
			.from(organizationModule)
			.where(eq(organizationModule.organizationId, tenant.organizationId)),
	]);
	const enabledAt = new Map(enabled.map((row) => [row.moduleId, row.enabledAt]));
	return {
		name: tenant.name,
		canManage: tenant.roles.some((role) => managers.includes(role)),
		members: members.map((m) => ({ ...m, roles: m.role.split(",").map((r) => r.trim()) })),
		modules: modules.map(({ id, label, description }) => ({
			id,
			label,
			description,
			enabledAt: enabledAt.get(id) ?? null,
		})),
	};
});

export const setModule = form(
	v.object({
		moduleId: v.picklist(modules.map((m) => m.id)),
		enabled: v.picklist(["on", "off"]),
	}),
	async ({ moduleId, enabled }) => {
		const { organizationId } = requireRole(...managers);
		if (enabled === "on") {
			await db
				.insert(organizationModule)
				.values({ organizationId, moduleId })
				.onConflictDoNothing();
		} else {
			await db
				.delete(organizationModule)
				.where(
					and(
						eq(organizationModule.organizationId, organizationId),
						eq(organizationModule.moduleId, moduleId),
					),
				);
		}
		// The tenant was loaded at the start of this request; bring it up to date before the
		// sidebar's query is refreshed with it.
		const { tenant } = getRequestEvent().locals;
		if (tenant) {
			tenant.modules =
				enabled === "on"
					? [...new Set([...tenant.modules, moduleId])]
					: tenant.modules.filter((id) => id !== moduleId);
		}
		void getSettings().refresh();
		void getCurrentTenant().refresh();
	},
);
