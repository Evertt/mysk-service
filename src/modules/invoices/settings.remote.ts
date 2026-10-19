/** The organization's invoicing settings: the defaults for the invoices it makes. */
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { settingsFields } from "./form/invoice-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { invoicingSettings } from "./server/schema.ts";
import { settingsOf } from "./server/settings.ts";

export const getInvoicingSettings = query(async () => {
	const tenant = currentTenant();
	const settings = await settingsOf(tenant.organizationId);
	return { ...settings, canManage: isManager(tenant.roles) };
});

export const saveSettings = forManagers.form(v.object(settingsFields), async (input) => {
	const { organizationId } = currentTenant();
	const before = await settingsOf(organizationId);
	await db.transaction(async (tx) => {
		await tx
			.update(invoicingSettings)
			.set(input)
			.where(eq(invoicingSettings.organizationId, organizationId));
		// The settings have no name of their own: they read as "invoicing settings".
		const subject: Subject = { type: "invoicing_settings", id: organizationId, label: "" };
		await recordActivity(tx, { action: "updated", subject, before, after: input });
	});
	void getInvoicingSettings().refresh();
	redirect(303, "/invoices");
});
