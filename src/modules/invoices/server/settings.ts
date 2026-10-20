/** The tenant's invoicing settings: the defaults for the invoices it makes. */
import * as v from "valibot";

import { currentDay } from "#lib/dates.ts";
import { defineTenantSettings } from "#lib/server/modules/settings.ts";

import { settingsFields } from "../form/invoice-schema.ts";
import { invoicingSettings } from "./schema.ts";

/**
 * The tenant's invoicing settings, with the settings page's remote functions
 * (`settings.remote.ts`). Made with the defaults the first time they're needed, billing other
 * modules' items from the start of that month.
 */
export const { settingsOf, getSettings, saveSettings } = defineTenantSettings(
	"invoices",
	invoicingSettings,
	{
		subject: "invoicing_settings",
		defaults: () => ({ billFrom: currentDay().with({ day: 1 }) }),
		schema: v.object(settingsFields),
	},
);
