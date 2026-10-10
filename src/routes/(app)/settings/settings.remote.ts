import { getRequestEvent } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { isManager, parseRoles } from "#lib/auth/index.ts";
import { getCurrentTenant } from "#lib/auth/session.remote.ts";
import { changeModules, effectiveModules } from "#lib/modules/graph.ts";
import { moduleGraph, moduleIds } from "#lib/modules/ids.ts";
import { modules } from "#lib/modules/manifests.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { member, organizationModule, user } from "#lib/server/db/schema.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

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
	const on = new Set(effectiveModules(enabled.map((row) => row.moduleId)));
	return {
		name: tenant.name,
		canManage: isManager(tenant.roles),
		members: members.map((m) => ({ ...m, roles: parseRoles(m.role) })),
		modules: modules.map(({ id, label, description }) => ({
			id,
			label,
			description,
			enabledAt: enabledAt.get(id) ?? null,
			alwaysOn: moduleGraph[id].alwaysOn,
			on: on.has(id),
		})),
	};
});

/** A module's name, for the activity log and messages. */
const moduleLabel = (id: string) => modules.find((m) => m.id === id)?.label ?? id;

const moduleList = v.optional(v.array(v.picklist(moduleIds)), []);

/**
 * Switches modules on and off together: the page sends a module with what it requires (to switch
 * on) or with what requires it (to switch off), and this refuses a set that would leave a module
 * without what it requires, or switch off an always-on one (`changeModules()`).
 */
export const setModules = forManagers.form(
	v.pipe(
		v.object({ enable: moduleList, disable: moduleList }),
		v.check(({ enable, disable }) => enable.length + disable.length > 0, m.common_error_generic),
	),
	async ({ enable, disable }) => {
		const { organizationId } = currentTenant();
		const outcome = await db.transaction(async (tx) => {
			const rows = await tx
				.select({ moduleId: organizationModule.moduleId })
				.from(organizationModule)
				.where(inTenant(organizationModule));
			const before = new Set(rows.map((row) => row.moduleId));
			const outcome = changeModules([...before], { enable, disable });
			if ("refused" in outcome) return outcome;
			const after = new Set<string>(outcome.stored);
			const added = outcome.stored.filter((id) => !before.has(id));
			const removed = moduleIds.filter((id) => before.has(id) && !after.has(id));
			if (added.length) {
				await tx
					.insert(organizationModule)
					.values(added.map((moduleId) => ({ organizationId, moduleId })));
			}
			if (removed.length) {
				await tx
					.delete(organizationModule)
					.where(and(inTenant(organizationModule), inArray(organizationModule.moduleId, removed)));
			}
			const changes = [
				...added.map((id) => ({ id, action: "module_enabled" as const })),
				...removed.map((id) => ({ id, action: "module_disabled" as const })),
			];
			for (const { id, action } of changes) {
				await recordActivity(tx, {
					action,
					subject: { type: "module", id, label: moduleLabel(id) },
				});
			}
			return outcome;
		});
		if ("refused" in outcome) {
			invalid(m.settings_modules_refused({ modules: outcome.refused.map(moduleLabel).join(", ") }));
		}
		// The tenant was loaded at the start of this request; bring it up to date before the
		// sidebar's query is refreshed with it.
		const { tenant } = getRequestEvent().locals;
		if (tenant) tenant.modules = effectiveModules(outcome.stored);
		void getOrganizationSettings().refresh();
		void getCurrentTenant().refresh();
	},
);
