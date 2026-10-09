/** The organization's invoicing settings: the defaults for the invoices it makes. */
import { form, query } from "$app/server";
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { isManager } from "#lib/auth";
import { recordActivity } from "#lib/server/activity";
import { requireManager, requireModule } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";

import { invoicingSettings } from "../../../../server/schema.ts";
import { settingsOf } from "../../../../server/settings.ts";
import { settingsFields } from "../invoice-schema.ts";

export const getInvoicingSettings = query(async () => {
	const tenant = requireModule("invoicing");
	const settings = await settingsOf(tenant.organizationId);
	return { ...settings, canManage: isManager(tenant.roles) };
});

export const saveSettings = form(v.object(settingsFields), async (input) => {
	requireModule("invoicing");
	const { organizationId } = requireManager();
	const before = await settingsOf(organizationId);
	await db.transaction(async (tx) => {
		await tx
			.update(invoicingSettings)
			.set(input)
			.where(eq(invoicingSettings.organizationId, organizationId));
		// The settings have no name of their own: they read as "invoicing settings".
		const subject = { type: "invoicing_settings", id: organizationId, label: "" };
		await recordActivity(tx, { action: "updated", subject, before, after: input });
	});
	void getInvoicingSettings().refresh();
	redirect(303, "/invoices");
});
