/**
 * The organization's maintenance settings: whether the daily run turns the plans that are due into
 * orders by itself (`server/automatic.ts`), how far ahead, and whether it emails the customers.
 * Every member may read them; only managers change them (`defineTenantSettings()`, in
 * `server/settings.ts`).
 */
export {
	getSettings as getMaintenanceSettings,
	saveSettings as saveMaintenanceSettings,
} from "./server/settings.ts";
