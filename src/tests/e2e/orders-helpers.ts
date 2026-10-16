/**
 * What the orders tests share: reading an order, its lines and its stock movements as stored, and
 * the order numbers the tenancy and language tests use.
 */
import { type App, rows, value } from "./app.ts";

/** The order numbers on the shown page of the list. */
export const shownNumbers = ({ page }: App) =>
	page.locator('[data-slot="data-table"] tbody td:nth-child(2)').allInnerTexts();

/** An order and its lines as stored, to check that a refused request changed nothing. */
export const snapshot = (id: number) =>
	rows(
		`select o.*, (select group_concat(material_id || 'x' || quantity || '@' || unit_price)
		 from order_line where order_id = o.id) as lines from "order" o where id = ?`,
		[id],
	);
export const orderId = (number: string, organizationId: string) =>
	value<number>(`select id from "order" where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);

export interface Movement {
	material_id: number;
	quantity: number;
	kind: string;
	order_number: string | null;
	note: string | null;
}

/**
 * The newest stock movement so far. Take it before creating an order, and pass it to
 * `orderMovements()`: order numbers are reused once the highest order is deleted (and its
 * movements keep the number), so by number alone a new order would also get the deleted one's
 * movements, e.g. from another file on this worker.
 */
export const movementMark = () => value<number>(`select coalesce(max(id), 0) from stock_movement`);

/**
 * The stock movements of an order (by its number, which they keep), oldest first. For an order
 * made by the test, only those after `since` (a `movementMark()` from before it was created).
 */
export const orderMovements = (number: string, organizationId: string, since = 0) =>
	rows<Movement>(
		`select material_id, quantity, kind, order_number, note from stock_movement
		 where order_number = ? and organization_id = ? and id > ? order by id`,
		[number, organizationId, since],
	);

/** An order's lines as stored, in order. */
export const orderLines = (id: number) =>
	rows<{ material_id: number; quantity: number }>(
		`select material_id, quantity from order_line where order_id = ? order by id`,
		[id],
	);

/**
 * Numbers that North has and South doesn't (North has 750 orders, South 320), and that both have.
 * SHLTR, numbering its own orders the same way, has them too.
 */
export const northOnly = "ORD-2026-00750";
export const shared = "ORD-2026-00320";
