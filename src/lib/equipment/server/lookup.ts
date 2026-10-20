import { equipment } from "#lib/server/db/schema.ts";
import { lookupBy } from "#lib/server/records.ts";

/**
 * The tenant's unit `serialNumber` (its page's URL key), with the fields asked for (its id by
 * default); or a 404 with core's message, wherever it's looked up (a module's card too). See
 * `lookupBy()`.
 */
export const unitBySerial = lookupBy(
	equipment,
	equipment.serialNumber,
	{ id: equipment.id },
	(serial) => m.equipment_serial_not_found({ serial }),
);
