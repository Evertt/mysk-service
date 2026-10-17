/**
 * The checklists module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`). A module that only enhances checklists may import this file, and
 * gets what it needs from the slot's props: never from checklists' tables.
 */
import { defineSlot } from "#lib/extensions/define.ts";

/**
 * Below a unit's checklist on the engineer portal's page of one of their orders, e.g. the condition
 * module's question how the unit is doing once its checklist is completed. They get the order's
 * number, the unit's id, whether the checklist is completed and whether the engineer can still
 * change things (the order in progress), load their own data with their module's remote functions,
 * and render nothing when they have nothing to ask.
 */
export const fieldChecklist = defineSlot<{
	number: string;
	equipmentId: number;
	completed: boolean;
	canChange: boolean;
}>("checklists.field.checklist");
