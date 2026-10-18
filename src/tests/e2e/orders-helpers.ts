/**
 * What the orders tests share: reading an order, its lines and its stock movements as stored, and
 * the order numbers the tenancy and language tests use.
 */
import { type App, rows, value } from "./app.ts";

/** The order numbers on the shown page of the list. */
export const shownNumbers = ({ page }: App) =>
	page.locator('[data-slot="data-table"] tbody td:nth-child(2)').allInnerTexts();

/** An order, its units and its lines as stored, to check that a refused request changed nothing. */
export const snapshot = (id: number) =>
	rows(
		`select o.*, (select group_concat(material_id || 'x' || quantity || '@' || unit_price)
		 from order_line where order_id = o.id) as lines,
		 (select group_concat(equipment_id || '@' || position) from order_unit where order_id = o.id)
		 as units from "order" o where id = ?`,
		[id],
	);

/** An order's units as stored, by id, in their order. */
export const orderUnits = async (id: number) =>
	(
		await rows<{ id: number }>(
			`select equipment_id as id from order_unit where order_id = ? order by position`,
			[id],
		)
	).map((row) => row.id);

/**
 * In the order form, ticks units in the "Add units" list (`which`: by their option's text, by id,
 * or the `n`th units, from 0, of the chosen customer's), and closes it again.
 */
export async function addUnits(
	{ page }: App,
	...which: (string | RegExp | number | { id: number })[]
) {
	await page.getByRole("button", { name: "Add units" }).click();
	// The list's units, not its "All units at …", nor the options of the form's selects.
	const units = page.locator('[data-slot="command-item"][data-value^="unit-"]');
	for (const unit of which) {
		await (
			typeof unit === "number"
				? units.nth(unit)
				: typeof unit === "object" && "id" in unit
					? page.locator(`[data-slot="command-item"][data-value="unit-${unit.id}"]`)
					: units.filter({ hasText: unit })
		).click();
	}
	await page.keyboard.press("Escape");
}

/** The units the order form has chosen, by id, in their order. */
export const formUnits = async ({ page }: App) =>
	(
		await page
			.locator('input[type="checkbox"][name*="equipmentIds"]')
			.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
	).map(Number);
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

/**
 * Numbers that North has and South doesn't (North has 750 orders, South 320), and that both have.
 * SHLTR, numbering its own orders the same way, has them too.
 */
export const northOnly = "ORD-2026-00750";
export const shared = "ORD-2026-00320";
