import type { OrderStatus } from "#lib/models.ts";

/**
 * What an engineer can do in the field (the engineer portal) with one of their orders, by its
 * status. The portal and the modules that add to its order page (`portal.order`) go by it.
 */
export function fieldActions(status: OrderStatus) {
	return {
		/** Start the job: a scheduled order is then in progress. */
		start: status === "scheduled",
		/** Log hours and materials, and complete it with the customer's sign-off. */
		work: status === "in_progress",
		/** Write a note, e.g. about access or what they found. */
		note: status === "scheduled" || status === "in_progress",
	};
}

/** Something an engineer can do with one of their orders (see `fieldActions`). */
export type FieldAction = keyof ReturnType<typeof fieldActions>;
