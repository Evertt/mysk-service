/**
 * An order's work record: what was done on its site. Its units in their order at their sites (with
 * their category and location), the notes engineers wrote, and the sign-off with the customer's and
 * the engineer's signatures. Who sees what of it is declared once, in `audiences`; a scope finds
 * the order and names its audience, and `readWorkRecord()` reads what that audience sees. What
 * isn't the work record stays with each caller: the order's own columns, its customer and request,
 * prices, tags, history and checklists.
 */
import { and, asc, type Column, eq, type GetColumnData, type SQL } from "drizzle-orm";

import { firstName } from "#lib/engineers/index.ts";
import {
	atSites,
	type CustomerAccess,
	customerOrders,
	engineerOrder,
	inTenant,
	type OrderRef,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
	orderNote,
	orderSignoff,
	orderUnit,
	user,
} from "#lib/server/db/schema.ts";

/** What an audience sees of the work record. */
interface Policy {
	/** The notes engineers wrote. */
	notes: boolean;
	/** Who in the office took the sign-off (an office user, on the engineer's behalf). */
	collectedBy: boolean;
	/** The order's engineer: by their full name, their first name only, or not at all. */
	engineer: "full" | "first" | "omit";
	/** Of a site, what's needed on it (contacts, time slot, access) or only its address. */
	site: "onSite" | "address";
	/** Until when each unit is under warranty. */
	warranty: boolean;
}

/** What each audience sees of an order's work record: the only place it's declared. */
const audiences = {
	office: { notes: true, collectedBy: true, engineer: "full", site: "onSite", warranty: true },
	engineer: { notes: true, collectedBy: false, engineer: "omit", site: "onSite", warranty: false },
	customer: {
		notes: false,
		collectedBy: false,
		engineer: "first",
		site: "address",
		warranty: false,
	},
	workOrder: {
		notes: false,
		collectedBy: false,
		engineer: "full",
		site: "address",
		warranty: false,
	},
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

/** The office's order `number`. */
export const officeOrder = (number: string) => scope("office", eq(order.number, number));

/** The office's orders `numbers`, read together (`readWorkRecords()`). */
export const officeOrders = (numbers: readonly string[]) =>
	scope("office", inList(order.number, numbers));

/** The signed-in engineer's order `ref`. */
export const engineerWork = async (ref: OrderRef) => scope("engineer", await engineerOrder(ref));

/** The customer's order `number` the contact sees, with only the units at their sites. */
export const customerWork = (access: CustomerAccess, number: string) =>
	scope(
		"customer",
		and(eq(order.number, number), customerOrders(access))!,
		atSites(access, equipment.siteId),
	);

/** The order `where` picks as its work order prints, with only the units `unitsAt` holds for. */
export const printedWorkOrder = (where: SQL, unitsAt: SQL | undefined) =>
	scope("workOrder", where, unitsAt);

/** Where a site is. */
const addressColumns = {
	id: customerSite.id,
	name: customerSite.name,
	address: customerSite.address,
	postalCode: customerSite.postalCode,
	city: customerSite.city,
} as const;

/** A site's columns, by what the audience sees of it. */
const siteColumns = {
	address: addressColumns,
	/** What the engineer needs of it: how to get there and in, and when to come. */
	onSite: {
		...addressColumns,
		country: customerSite.country,
		contactName: customerSite.contactName,
		contactPhone: customerSite.contactPhone,
		contactEmail: customerSite.contactEmail,
		contactChannel: customerSite.contactChannel,
		preferredDay: customerSite.preferredDay,
		slotStart: customerSite.slotStart,
		slotEnd: customerSite.slotEnd,
		priority: customerSite.priority,
		accessNotes: customerSite.accessNotes,
	},
} as const;

type SiteDetail = keyof typeof siteColumns;

/** A site as the audience sees it. */
type Site<D extends SiteDetail> = {
	[K in keyof (typeof siteColumns)[D]]: (typeof siteColumns)[D][K] extends Column
		? GetColumnData<(typeof siteColumns)[D][K]>
		: never;
};

/** The orders' units the scope sees, each order's in its order, at their sites. */
const unitsOf = <D extends SiteDetail>(orderIds: number[], unitsAt: SQL | undefined, detail: D) =>
	db
		.select({
			orderId: orderUnit.orderId,
			id: equipment.id,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
			serialNumber: equipment.serialNumber,
			status: equipment.status,
			warrantyUntil: equipment.warrantyUntil,
			category: equipmentCategory.name,
			/** Where it is at the site, if that needs saying. */
			location: equipmentLocation.name,
			site: siteColumns[detail] as (typeof siteColumns)["onSite"],
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.where(and(inList(orderUnit.orderId, orderIds), inTenant(orderUnit), unitsAt))
		.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));

/** The sites of these customers, for the orders without units. */
const customerSitesOf = <D extends SiteDetail>(customerIds: number[], detail: D) =>
	db
		.select({
			customerId: customerSite.customerId,
			site: siteColumns[detail] as (typeof siteColumns)["onSite"],
		})
		.from(customerSite)
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

type Unit = Omit<Awaited<ReturnType<typeof unitsOf>>[number], "orderId">;
type Note = Omit<Awaited<ReturnType<typeof notesOf>>[number], "orderId">;
type Signoff = Omit<Awaited<ReturnType<typeof signoffsOf>>[number], "orderId" | "collectedBy">;

type PolicyOf<A extends Audience> = (typeof audiences)[A];

/** What audience `A` doesn't see of a unit, besides its site's detail. */
type Withheld<A extends Audience> = PolicyOf<A>["warranty"] extends true ? never : "warrantyUntil";

/** The work record as audience `A` sees it: a key its table says no to isn't in the type. */
export type WorkRecord<A extends Audience> = {
	/** In their order, each at its site. */
	units: (Omit<Unit, "site" | Withheld<A>> & { site: Site<PolicyOf<A>["site"]> })[];
	/** Where the work is: the units' sites, or the customer's only one for an order without units. */
	sites: Site<PolicyOf<A>["site"]>[];
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
		unitsOf(ids, scope.unitsAt, policy.site).then(byOrder),
		customerSitesOf([...new Set(found.map((one) => one.customerId))], policy.site).then((rows) =>
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
				units: policy.warranty
					? own
					: own.map((unit) => {
							const { warrantyUntil: _, ...shown } = unit;
							return shown;
						}),
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
