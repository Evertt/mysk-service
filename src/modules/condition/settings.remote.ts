/**
 * The organization's condition settings: the thresholds of critical and attention, and whether the
 * daily run plans the critical units by itself (`server/automatic.ts`). Every member may read
 * them; only managers change them (`defineTenantSettings()`, in `server/settings.ts`).
 */
export {
	getSettings as getConditionSettings,
	saveSettings as saveConditionSettings,
} from "./server/settings.ts";
