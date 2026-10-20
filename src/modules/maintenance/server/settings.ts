/** The tenant's maintenance settings: whether, and how far ahead, plans become orders by themselves. */
import { defineTenantSettings } from "#lib/server/modules/settings.ts";

import { settingsSchema } from "../form/settings-schema.ts";
import { maintenanceSettings } from "./schema.ts";

/**
 * The tenant's maintenance settings, made with the defaults (automatic orders off) when first read,
 * with the settings page's remote functions (`settings.remote.ts`).
 */
export const { settingsOf, updateSettings, getSettings, saveSettings } = defineTenantSettings(
	"maintenance",
	maintenanceSettings,
	{ subject: "maintenance_settings", schema: settingsSchema },
);
