/**
 * The contracts module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). A module that only enhances contracts may import this file, and
 * gets what it needs from the slot's props: never from contracts' tables.
 */
import { defineRecordPoints, slotProps } from "#lib/extensions/define.ts";

/**
 * A contract's points: cards in the columns of its page, e.g. the maintenance plans of the units
 * it covers. They get the contract's number and the ids of the units it covers (the current
 * tenant's), load their own data with their module's remote functions, and render nothing when
 * they have nothing to say.
 */
export const points = defineRecordPoints("contracts", {
	detail: slotProps<{ number: string; equipmentIds: number[] }>(),
});
