/**
 * The energy module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). The seam for the docks module: a monitored door that's a dock's
 * door (`D-05` is Salvo's DOCK 05, §2.5) can show the dock's state next to its loss, and an alert
 * on it could link the dock's session. Docks would `enhances: ["energy"]` and contribute
 * `slots/energy.door/<name>.svelte`, matching the door to its dock by the unit (`equipmentId`).
 */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Below a door's card on the site's page: the door (its id in the energy module, its code) and
 * the unit it is, if it's linked to one.
 */
export const doorCard = defineSlot<{ doorId: number; code: string; equipmentId: number | null }>(
	"energy.door",
);
