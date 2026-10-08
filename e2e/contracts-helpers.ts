/**
 * What the contracts module does to an order's price and to what is billed, worked out in SQL for
 * the e2e tests: which contract covers an order, what the order costs, and which monthly fees are
 * due. It stays here, not in the module's `e2e/`, because the core's tests of prices (a customer's
 * revenue, a unit's cost) need it, and so do the invoicing module's, which bills the discounts and
 * fees of contracts; only a module's own files may import from it (`src/modules/boundaries.spec.ts`).
 * It names the contracts' tables in SQL only.
 */
import { rows } from "./app.ts";

/** The standard hourly rate for orders without an engineer (`#lib/orders/server/pricing.ts`), in cents. */
export const STANDARD_RATE = 8500;

/**
 * The contract that covered each order, as `src/modules/contracts/coverage.ts` defines it:
 * one covering its unit on the day the order was created (contracts run up to and including their
 * last day), not for an installation, the fastest response first (`n = 1`).
 */
export const covered = `covered as (
	select o.id as order_id, k.number, k.level, k.response_hours,
		row_number() over (partition by o.id order by k.response_hours, k.id) as n
	from "order" o join contract_equipment ce on ce.equipment_id = o.equipment_id
	join contract k on k.id = ce.contract_id and k.organization_id = o.organization_id
	where o.type != 'installation' and k.starts_on <= o.created_at and o.created_at < k.ends_on + 86400
)`;

/** An order with what goes into its price. */
export interface PricedOrder {
	number: string;
	status: string;
	/** The order lines' total, in cents. */
	materials: number;
	labor_hours: number;
	hourly_rate: number | null;
	/** The contract covering it, if any and the organization has the contracts module. */
	contract: string | null;
	level: string | null;
	/** Its unit's serial number. */
	equipment: string | null;
	/** Its customer's code. */
	customer: string;
}

/** An organization's orders matching `where` (`o` is the order), by number, with what goes into their price. */
export const pricedOrders = (organizationId: string, where = "1", args: (string | number)[] = []) =>
	rows<PricedOrder>(
		`with ${covered} select o.number, o.status, o.labor_hours, e.hourly_rate, c.number as contract,
		 c.level, u.serial_number as equipment, cu.code as customer,
		 (select coalesce(sum(round(l.quantity * l.unit_price)), 0) from order_line l where l.order_id = o.id) as materials
		 from "order" o join customer cu on cu.id = o.customer_id
		 left join engineer e on e.id = o.engineer_id
		 left join equipment u on u.id = o.equipment_id
		 left join covered c on c.order_id = o.id and c.n = 1 and exists (select 1 from organization_module m
			where m.organization_id = o.organization_id and m.module_id = 'contracts')
		 where o.organization_id = ? and ${where} order by o.number`,
		[organizationId, ...args],
	);

/**
 * An order's price, in cents, as `priceOrders()` makes it: materials plus labour, less what its
 * contract includes (standard: the labour; premium: labour and materials).
 */
export function priceOf(order: PricedOrder) {
	const labor = Math.round(order.labor_hours * (order.hourly_rate ?? STANDARD_RATE));
	const included =
		order.level === "premium" ? labor + order.materials : order.level === "standard" ? labor : 0;
	return { labor, included, total: order.materials + labor - included };
}

/**
 * This month's fee of each of a customer's active contracts (they start on the 1st), with the
 * reference that whoever bills it remembers it by (see `monthlyFee` in
 * `src/modules/contracts/billing.ts`): `contracts:<id>:<month>`.
 */
export async function feesDue(customerId: number) {
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
	const active = await rows<{ id: number; monthly_fee: number }>(
		`select id, monthly_fee from contract where customer_id = ?
		 and starts_on <= unixepoch() and ends_on + 86400 > unixepoch() order by id`,
		[customerId],
	);
	return active.map((c) => ({ reference: `contracts:${c.id}:${month}`, fee: c.monthly_fee }));
}
