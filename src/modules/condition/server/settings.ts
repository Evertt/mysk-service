/** The tenant's condition settings: its thresholds, and whether critical units are planned by themselves. */
import { defineTenantSettings } from "#lib/server/modules/settings.ts";

import { settingsSchema } from "../form/settings-schema.ts";
import type { Thresholds } from "../model.ts";
import { conditionSettings } from "./schema.ts";

/**
 * The tenant's condition settings, made with the defaults (automatic planning off) when first read,
 * with the settings page's remote functions (`settings.remote.ts`).
 */
export const { settingsOf, updateSettings, getSettings, saveSettings } = defineTenantSettings(
	"condition",
	conditionSettings,
	{ subject: "condition_settings", schema: settingsSchema },
);

/** The tenant's thresholds. */
export async function thresholdsOf(): Promise<Thresholds> {
	const settings = await settingsOf();
	return { critical: settings.criticalBelow, attention: settings.attentionBelow };
}
