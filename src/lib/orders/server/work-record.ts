/**
 * An order's work record: what was done on its site. Its units in their order at their sites (with
 * their category and location), the notes engineers wrote, and the sign-off with the customer's and
 * the engineer's signatures. Who sees what of it is declared once, in `audiences`; a scope finds
 * the order and names its audience, and `readWorkRecord()` reads what that audience sees. What
 * isn't the work record stays with each caller: the order's own columns, its customer and request,
 * prices, tags, history and checklists.
 */
import { and, asc, eq, type SQL, sql } from "drizzle-orm";

import { firstName } from "#lib/engineers/index.ts";
import {
	type SiteOf,
	siteColumnsOf,
	type UnitAudience,
	unitColumns,
	type UnitOf,
} from "#lib/equipment/server/index.ts";
import { doneOrderStatuses } from "#lib/models.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { type Viewer, viewerAs } from "#lib/server/access/viewer.ts";
import {
	atSites,
	type CustomerAccess,
	inTenant,
	type OrderRef,
	orderNamed,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	order,
	orderNote,
	orderSignoff,
	user,
} from "#lib/server/db/schema.ts";

import { listedUnitsOf } from "./units.ts";

/** What an audience sees of the work record. */
interface Policy {
	/** The notes engineers wrote. */
	notes: boolean;
	/** Who in the office took the sign-off (an office user, on the engineer's behalf). */
	collectedBy: boolean;
	/** The order's engineer: by their full name, their first name only, or not at all. */
	engineer: "full" | "first" | "omit";
	/**
	 * Its units and their sites as which audience sees them (`readUnits()`'s policy): the office's
	 * (with the sites' `onSite` columns and the warranty), the engineer's (`onSite`, no warranty) or
	 * the customer's (the sites' address only).
	 */
	units: UnitAudience;
}

/** What each audience sees of an order's work record: the only place it's declared. */
const audiences = {
	office: { notes: true, collectedBy: true, engineer: "full", units: "office" },
	engineer: { notes: true, collectedBy: false, engineer: "omit", units: "engineerAtOrder" },
	customer: { notes: false, collectedBy: false, engineer: "first", units: "customer" },
	// Handed to the customer: their view of its units.
	workOrder: { notes: false, collectedBy: false, engineer: "full", units: "customer" },
} as const satisfies Record<string, Policy>;

export type Audience = keyof typeof audiences;

declare const scoped: unique symbol;

/** Which order, and who reads it: made only by the scopes below. */
export interface WorkScope<A extends Audience> {
	readonly [scoped]: A;
	readonly audience: A;
	/** Picks the order, on `order` (the tenant's and the audience's). */
	readonly where: SQL;
	/** Of its units, only those this holds for (on `equipment`), e.g. a contact's sites. */
	readonly unitsAt: SQL | undefined;
}

const scope = <A extends Audience>(audience: A, where: SQL, unitsAt?: SQL) =>
	({ audience, where: and(where, inTenant(order))!, unitsAt }) as WorkScope<A>;

/** The orders `viewer` may read (the access registry's `order` rule); none if it has no rule. */
const ordersOf = (viewer: Viewer) => visibleOrNone("order", "read", viewer);

/** The office's order `number`. */
export const officeOrder = async (number: string) =>
	scope("office", and(eq(order.number, number), await ordersOf(await viewerAs("office")))!);

/** The office's orders `numbers`, read together (`readWorkRecords()`). */
export const officeOrders = async (numbers: readonly string[]) =>
	scope("office", and(inList(order.number, numbers), await ordersOf(await viewerAs("office")))!);

/** The signed-in engineer's order `ref`. */
export const engineerWork = async (ref: OrderRef) => {
	return scope("engineer", and(orderNamed(ref), await ordersOf(await viewerAs("engineer")))!);
};

/** The customer's order `number` the contact sees, with only the units at their sites. */
export const customerWork = async (access: CustomerAccess, number: string) =>
	scope(
		"customer",
		and(eq(order.number, number), await ordersOf({ audience: "customer", access }))!,
		atSites(access, equipment.siteId),
	);

/**
 * The order `number` as it prints (its work order), as `viewer` may have it: the office's any of
 * the tenant's, a customer's contact's their done orders only (a work order is what the engineer
 * signed off), with only the units at their sites. Anyone else's: none.
 */
export async function printedWorkOrder(number: string, viewer: Viewer) {
	const named = eq(order.number, number);
	if (viewer.audience === "customer") {
		return scope(
			"workOrder",
			and(named, await ordersOf(viewer), inList(order.status, doneOrderStatuses))!,
			atSites(viewer.access, equipment.siteId),
		);
	}
	if (viewer.audience === "office") {
		return scope("workOrder", and(named, await ordersOf(viewer))!);
	}
	return scope("workOrder", sql`0`);
}

/** The sites of these customers as `audience` sees them, for the orders without units. */
const customerSitesOf = (customerIds: number[], audience: UnitAudience) =>
	db
		.select({ customerId: customerSite.customerId, site: siteColumnsOf(audience) })
		.from(customerSite)
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(and(inList(customerSite.customerId, customerIds), inTenant(customerSite)));

/**
 * Where the work is: the units' sites (one, usually), or for an order without units the
 * customer's site if it has only one, else none.
 */
function sitesOf<S extends { id: number }>(units: { site: S }[], customerSites: S[]): S[] {
	if (units.length) return [...new Map(units.map((unit) => [unit.site.id, unit.site])).values()];
	return customerSites.length === 1 ? customerSites : [];
}

/** The orders' notes, oldest first, with who wrote them. */
const notesOf = (orderIds: number[]) =>
	db
		.select({
			orderId: orderNote.orderId,
			id: orderNote.id,
			text: orderNote.text,
			createdAt: orderNote.createdAt,
			author: user.name,
		})
		.from(orderNote)
		.leftJoin(user, eq(orderNote.userId, user.id))
		.where(and(inList(orderNote.orderId, orderIds), inTenant(orderNote)))
		.orderBy(asc(orderNote.createdAt), asc(orderNote.id));

/** The orders' sign-offs, with who in the office took each. */
const signoffsOf = (orderIds: number[]) =>
	db
		.select({
			orderId: orderSignoff.orderId,
			signerName: orderSignoff.signerName,
			signature: orderSignoff.signature,
			engineerName: orderSignoff.engineerName,
			engineerSignature: orderSignoff.engineerSignature,
			signedAt: orderSignoff.signedAt,
			collectedBy: user.name,
		})
		.from(orderSignoff)
		.leftJoin(user, eq(orderSignoff.userId, user.id))
		.where(and(inList(orderSignoff.orderId, orderIds), inTenant(orderSignoff)));

/** The values of `entries` by their key. */
function grouped<K, V>(entries: Iterable<readonly [K, V]>) {
	const map = new Map<K, V[]>();
	for (const [key, value] of entries) map.set(key, [...(map.get(key) ?? []), value]);
	return map;
}

/** `rows` by their order, without its id. */
const byOrder = <T extends { orderId: number }>(rows: T[]) =>
	grouped(rows.map(({ orderId, ...row }) => [orderId, row] as const));

type Note = Omit<Awaited<ReturnType<typeof notesOf>>[number], "orderId">;
type Signoff = Omit<Awaited<ReturnType<typeof signoffsOf>>[number], "orderId" | "collectedBy">;

type PolicyOf<A extends Audience> = (typeof audiences)[A];

/** Whose view of the units audience `A` has. */
type UnitsOf<A extends Audience> = PolicyOf<A>["units"];

/** The work record as audience `A` sees it: a key its table says no to isn't in the type. */
export type WorkRecord<A extends Audience> = {
	/** In their order, each at its site. */
	units: UnitOf<UnitsOf<A>>[];
	/** Where the work is: the units' sites, or the customer's only one for an order without units. */
	sites: SiteOf<UnitsOf<A>>[];
	signoff:
		| (Signoff & (PolicyOf<A>["collectedBy"] extends true ? { collectedBy: string | null } : {}))
		| null;
} & (PolicyOf<A>["notes"] extends true ? { notes: Note[] } : {}) &
	(PolicyOf<A>["engineer"] extends "omit" ? {} : { engineer: string | null });

/** The work record the scope's audience sees, or `undefined` (the caller 404s, with its message). */
export async function readWorkRecord<A extends Audience>(
	scope: WorkScope<A>,
): Promise<WorkRecord<A> | undefined> {
	const [record] = (await readWorkRecords(scope)).values();
	return record;
}

/**
 * The work records of the orders the scope picks, by their number, in as many statements as one
 * order's: for a batch query (`getOrder`). An order the scope doesn't reach isn't in it.
 */
export async function readWorkRecords<A extends Audience>(
	scope: WorkScope<A>,
): Promise<Map<string, WorkRecord<A>>> {
	const policy: Policy = audiences[scope.audience];
	const found = await db
		.select({
			id: order.id,
			number: order.number,
			customerId: order.customerId,
			engineer: engineer.name,
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(scope.where);
	if (!found.length) return new Map();
	const ids = found.map((one) => one.id);
	const [units, customerSites, notes, signoffs] = await Promise.all([
		listedUnitsOf(ids, { columns: unitColumns(policy.units), where: scope.unitsAt }),
		customerSitesOf([...new Set(found.map((one) => one.customerId))], policy.units).then((rows) =>
			grouped(rows.map((row) => [row.customerId, row.site] as const)),
		),
		policy.notes ? notesOf(ids).then(byOrder) : undefined,
		signoffsOf(ids).then(byOrder),
	]);
	return new Map(
		found.map((one) => {
			const own = units.get(one.id) ?? [];
			const [signed = null] = signoffs.get(one.id) ?? [];
			let signoff: Record<string, unknown> | null = signed;
			if (signed && !policy.collectedBy) {
				const { collectedBy: _, ...rest } = signed;
				signoff = rest;
			}
			const record: Record<string, unknown> = {
				units: own,
				sites: sitesOf(own, customerSites.get(one.customerId) ?? []),
				signoff,
			};
			if (notes) record.notes = notes.get(one.id) ?? [];
			if (policy.engineer === "full") record.engineer = one.engineer;
			// Only who's coming, by their first name.
			if (policy.engineer === "first") record.engineer = one.engineer && firstName(one.engineer);
			return [one.number, record as WorkRecord<A>];
		}),
	);
}
