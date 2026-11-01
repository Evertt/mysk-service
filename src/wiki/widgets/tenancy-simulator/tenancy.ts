/**
 * The tenancy simulator's model, for `<TenancySimulator>`: one `order` table that two tenants share,
 * and what a query reads from it as one of them, with the tenant's scope (`inTenant()`,
 * `idInTenant()` in `#lib/server/auth/session.ts`) or without. Ids are global, so an id from the
 * client finds another tenant's order unless the scope stops it.
 */

/** An order in the shared table. */
export interface FixtureOrder {
	id: number;
	organization: "North" | "South";
	number: string;
	customer: string;
}

type Tenant = FixtureOrder["organization"];

/**
 * Three orders of each tenant, in the order they were made: their ids interleave, and each tenant
 * numbers its own from 1, so the numbers repeat across tenants and only the ids are unique.
 */
export const fixtureOrders: readonly FixtureOrder[] = [
	{ id: 1, organization: "North", number: "ORD-2026-00001", customer: "Harbour Café" },
	{ id: 2, organization: "South", number: "ORD-2026-00001", customer: "Southfield School" },
	{ id: 3, organization: "North", number: "ORD-2026-00002", customer: "Northgate Logistics" },
	{ id: 4, organization: "South", number: "ORD-2026-00002", customer: "Valley Dairy" },
	{ id: 5, organization: "North", number: "ORD-2026-00003", customer: "Pier 9 Cold Storage" },
	{ id: 6, organization: "South", number: "ORD-2026-00003", customer: "Riverside Garden Centre" },
];

/** The query as the app writes it (drizzle), then the SQL it sends. */
function statement(tenant: Tenant, scoped: boolean, id: number | undefined) {
	const condition = scoped
		? id === undefined
			? "inTenant(order)"
			: `idInTenant(order, ${id})`
		: id === undefined
			? undefined
			: `eq(order.id, ${id})`;
	const organization = `'${tenant.toLowerCase()}'`;
	const where = [
		...(id === undefined ? [] : [`"id" = ${id}`]),
		...(scoped ? [`"organization_id" = ${organization}`] : []),
	];
	return [
		`db.select().from(order)${condition ? `\n  .where(${condition})` : ""}`,
		"",
		`select * from "order"${where.length ? `\nwhere ${where.join("\n  and ")}` : ""}`,
	].join("\n");
}

/**
 * What `tenant` reads of the orders, `scoped` to it or not, and with `id` one order by its id (as a
 * page asks for one): the rows, or the 404 the app answers when the scoped lookup finds none.
 */
export function runQuery(q: {
	tenant: Tenant;
	scoped: boolean;
	id?: number;
}): { rows: FixtureOrder[]; sql: string } | { refused: 404; sql: string } {
	const sql = statement(q.tenant, q.scoped, q.id);
	const rows = fixtureOrders.filter(
		(order) =>
			(!q.scoped || order.organization === q.tenant) && (q.id === undefined || order.id === q.id),
	);
	return q.id !== undefined && !rows.length ? { refused: 404, sql } : { rows, sql };
}
