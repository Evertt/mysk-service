/**
 * The organization's maintenance settings: whether the daily run turns the plans that are due into
 * orders by itself (`server/automatic.ts`), how far ahead, and whether it emails the customers.
 * Every member may read them; only managers change them.
 */
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import { isManager } from "#lib/auth/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { settingsSchema } from "./form/settings-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { maintenanceSettings } from "./server/schema.ts";
import { settingsOf } from "./server/settings.ts";

/** The tenant's settings, when the daily run last made orders, and whether the user may change them. */
export const getMaintenanceSettings = query(async () => {
	const tenant = currentTenant();
	const settings = await settingsOf(tenant.organizationId);
	return { ...settings, canManage: isManager(tenant.roles) };
});

export const saveMaintenanceSettings = forManagers.form(settingsSchema, async (input) => {
	const { organizationId } = currentTenant();
	const before = await settingsOf(organizationId);
	await db.transaction(async (tx) => {
		await tx
			.update(maintenanceSettings)
			.set(input)
			.where(eq(maintenanceSettings.organizationId, organizationId));
		// The settings have no name of their own: they read as "maintenance settings".
		const subject: Subject = { type: "maintenance_settings", id: organizationId, label: "" };
		await recordActivity(tx, { action: "updated", subject, before, after: input });
	});
	void getMaintenanceSettings().refresh();
	redirect(303, "/maintenance");
});
