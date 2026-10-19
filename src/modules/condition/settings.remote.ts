/**
 * The organization's condition settings: the thresholds of critical and attention, and whether the
 * daily run plans the critical units by itself (`server/automatic.ts`). Every member may read
 * them; only managers change them.
 */
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import { isManager } from "#lib/auth/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { settingsSchema } from "./form/settings-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { conditionSettings } from "./server/schema.ts";
import { settingsOf } from "./server/settings.ts";

/** The tenant's settings, when the daily run last planned units, and whether the user may change them. */
export const getConditionSettings = query(async () => {
	const tenant = currentTenant();
	const settings = await settingsOf(tenant.organizationId);
	return { ...settings, canManage: isManager(tenant.roles) };
});

export const saveConditionSettings = forManagers.form(settingsSchema, async (input) => {
	const { organizationId } = currentTenant();
	const before = await settingsOf(organizationId);
	await db.transaction(async (tx) => {
		await tx
			.update(conditionSettings)
			.set(input)
			.where(eq(conditionSettings.organizationId, organizationId));
		// The settings have no name of their own: they read as "condition settings".
		const subject: Subject = { type: "condition_settings", id: organizationId, label: "" };
		await recordActivity(tx, { action: "updated", subject, before, after: input });
	});
	void getConditionSettings().refresh();
	redirect(303, "/condition");
});
