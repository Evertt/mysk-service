/**
 * The contracts module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). A module that only enhances contracts may import this file, and
 * gets what it needs from the slot's props: never from contracts' tables.
 */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Cards in the side column of a contract's page, e.g. the maintenance plans of the units it
 * covers. They get the contract's number and the ids of the units it covers (the current
 * tenant's), load their own data with their module's remote functions, and render nothing when
 * they have nothing to say.
 */
export const detailSide = defineSlot<{ number: string; equipmentIds: number[] }>(
	"contracts.detail.side",
);
