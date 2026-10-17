/** What the parts shop's end-to-end tests share: its records as stored. */
import { organizations, rows, value } from "#e2e/app.ts";

const { shltr } = organizations;

/** One of SHLTR's customers, by name. */
export const customerNamed = async (name: string) =>
	(
		await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? and name = ?`,
			[shltr.id, name],
		)
	)[0];

/** SHLTR's shop product of a material, by SKU, with the material's price and stock. */
export const productOf = async (sku: string) =>
	(
		await rows<{ id: number; material_id: number; price: number; stock: number; name: string }>(
			`select p.id, p.material_id, m.unit_price as price, m.stock, m.name from shop_product p
			 join material m on m.id = p.material_id where p.organization_id = ? and m.sku = ?`,
			[shltr.id, sku],
		)
	)[0];

/** A material's stock now. */
export const stockOf = (materialId: number) =>
	value<number>(`select stock from material where id = ?`, [materialId]);

/** A shop order as stored, by number. */
export const shopOrderOf = async (number: string) =>
	(
		await rows<{
			id: number;
			status: string;
			total: number;
			vat: number;
			customer_id: number;
			wallet_entry_id: number | null;
		}>(
			`select id, status, total, vat, customer_id, wallet_entry_id from shop_order
			 where organization_id = ? and number = ?`,
			[shltr.id, number],
		)
	)[0];

/** A customer's wallet entries, in the order they were made. */
export const walletOf = (customerId: number) =>
	rows<{ kind: string; amount: number; valid_until: string | null; note: string | null }>(
		`select kind, amount, valid_until, note from partner_wallet_entry where customer_id = ? order by id`,
		[customerId],
	);

/** What the customer's wallet holds: the sum of its entries. */
export const balanceOf = async (customerId: number) =>
	Number(
		await value(`select coalesce(sum(amount), 0) from partner_wallet_entry where customer_id = ?`, [
			customerId,
		]),
	);

/** The stock movements whose note is a shop order's number. */
export const movementsOf = (number: string) =>
	rows<{ material_id: number; quantity: number; kind: string }>(
		`select material_id, quantity, kind from stock_movement where organization_id = ? and note = ?
		 order by id`,
		[shltr.id, number],
	);

/** The next shop order's number: SHLTR's highest sequence, plus one. */
export async function nextShopNumber() {
	const last = Number(
		await value(
			`select max(cast(substr(number, 9) as integer)) from shop_order where organization_id = ?`,
			[shltr.id],
		),
	);
	return `SH-${Temporal.Now.plainDateISO().year}-${String(last + 1).padStart(3, "0")}`;
}
