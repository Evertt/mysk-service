/**
 * How the activity log names orders, customers and units: by the field their page is found by
 * (`subjectTypes`' links: `/orders/[number]`, `/customers/[code]`, `/equipment/[serial]`), so an
 * entry about one, or about one of its parts, links to its page. Use these for them, as the
 * subject or as the parent, rather than writing the subject out.
 */

/** An order, by its number. */
export const orderSubject = (order: { id: number; number: string }) => ({
	type: "order" as const,
	id: order.id,
	label: order.number,
});

/** A customer, by their code. */
export const customerSubject = (customer: { id: number; code: string }) => ({
	type: "customer" as const,
	id: customer.id,
	label: customer.code,
});

/** A unit, by its serial number. */
export const equipmentSubject = (unit: { id: number; serialNumber: string }) => ({
	type: "equipment" as const,
	id: unit.id,
	label: unit.serialNumber,
});
