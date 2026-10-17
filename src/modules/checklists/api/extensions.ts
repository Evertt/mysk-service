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

/** A rejected point of a checklist, with the template point it was copied from. */
export interface RejectedPoint {
	/** The template point's id; points whose template point is gone are left out. */
	templateItemId: number;
	text: string;
	/** The unit's title, e.g. "Sectionaaldeur dock 3". */
	unit: string;
}

/**
 * Under the checklists' card on an order's page in the office, e.g. the parts shop's part a
 * rejected point needs ("Benodigd onderdeel"). They get the order's number and its checklists'
 * rejected points, and render nothing when they have nothing for them.
 */
export const orderRejected = defineSlot<{ number: string; rejected: RejectedPoint[] }>(
	"checklists.order.rejected",
);

/**
 * Under the checklists' results on an order's page in the customer portal, e.g. the parts shop's
 * way to order the part a rejected point needs ("Bestel in de shop"). Like `orderRejected`.
 */
export const clientRejected = defineSlot<{ number: string; rejected: RejectedPoint[] }>(
	"checklists.client.rejected",
);
