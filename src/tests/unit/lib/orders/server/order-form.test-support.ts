/**
 * What the orders' server specs share: an order as stored (to check that a refused request changed
 * nothing), its id by number, and its edit form as the browser submits it.
 */
import { getTimeZone } from "#lib/dates.ts";
import { getOrder } from "#lib/orders/order.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, data, rows, value } from "#unit/lib/server/harness/index.ts";

/** An order, its units and its lines as stored, to check that a refused request changed nothing. */
export const snapshot = (id: number) =>
	rows(
		`select o.*, (select group_concat(material_id || 'x' || quantity || '@' || unit_price)
		 from order_line where order_id = o.id) as lines,
		 (select group_concat(equipment_id || '@' || position) from order_unit where order_id = o.id)
		 as units from "order" o where id = ?`,
		[id],
	);

/** The id of the order `number` of the organization `organizationId` (e.g. `org-north`). */
export const orderId = (number: string, organizationId: string) =>
	value<number>(`select id from "order" where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);

/**
 * The edit form of `actor`'s order `number` as the browser submits it: its fields as the page
 * fills them (from `getOrder()`), with its material lines, and `changes` over them.
 */
export async function editForm(
	actor: Actor,
	number: string,
	changes: Record<string, unknown> = {},
) {
	const { order } = await as(actor, () => data(getOrder, number));
	const scheduled = order.scheduledFor?.toZonedDateTimeISO(getTimeZone());
	const lines = await rows<{ material_id: number; quantity: number }>(
		`select material_id, quantity from order_line where order_id = ? order by id`,
		[order.id],
	);
	return {
		id: String(order.id),
		customerId: String(order.customerId),
		equipmentIds: order.units.map((unit) => String(unit.id)),
		engineerId: order.engineerId ? String(order.engineerId) : "",
		type: order.type,
		status: order.status,
		priority: order.priority,
		description: order.description,
		scheduledFor: scheduled ? scheduled.toPlainDate().toString() : "",
		scheduledTime: scheduled ? scheduled.toPlainTime().toString({ smallestUnit: "minute" }) : "",
		laborHours: order.laborHours,
		modules: {
			materials: {
				lines: lines.map((line) => ({
					materialId: String(line.material_id),
					quantity: line.quantity,
				})),
			},
		},
		...changes,
	};
}
