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

/** The order's units the scope sees, in their order, at their sites. */
const unitsOf = <D extends SiteDetail>(orderId: number, unitsAt: SQL | undefined, detail: D) =>
	db
		.select({
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
		.where(and(eq(orderUnit.orderId, orderId), inTenant(orderUnit), unitsAt))
		.orderBy(asc(orderUnit.position));

/**
 * Where the work is: the units' sites (one, usually), or for an order without units the
 * customer's site if it has only one, else none.
 */
async function sitesOf<D extends SiteDetail>(
	units: { site: Site<D> }[],
	customerId: number,
	detail: D,
): Promise<Site<D>[]> {
	if (units.length) return [...new Map(units.map((unit) => [unit.site.id, unit.site])).values()];
	const sites = await db
		.select(siteColumns[detail] as (typeof siteColumns)["onSite"])
		.from(customerSite)
		.where(and(eq(customerSite.customerId, customerId), inTenant(customerSite)))
		.limit(2);
	return (sites.length === 1 ? sites : []) as Site<D>[];
}

/** The order's notes, oldest first, with who wrote them. */
const notesOf = (orderId: number) =>
	db
		.select({
			id: orderNote.id,
			text: orderNote.text,
			createdAt: orderNote.createdAt,
			author: user.name,
		})
		.from(orderNote)
		.leftJoin(user, eq(orderNote.userId, user.id))
		.where(and(eq(orderNote.orderId, orderId), inTenant(orderNote)))
		.orderBy(asc(orderNote.createdAt), asc(orderNote.id));

/** The order's sign-off, with who in the office took it if `collectedBy`. */
async function signoffOf(orderId: number, collectedBy: boolean) {
	const [found] = await db
		.select({
			signerName: orderSignoff.signerName,
			signature: orderSignoff.signature,
			engineerName: orderSignoff.engineerName,
			engineerSignature: orderSignoff.engineerSignature,
			signedAt: orderSignoff.signedAt,
			collectedBy: user.name,
		})
		.from(orderSignoff)
		.leftJoin(user, eq(orderSignoff.userId, user.id))
		.where(and(eq(orderSignoff.orderId, orderId), inTenant(orderSignoff)));
	if (!found || collectedBy) return found ?? null;
	const { collectedBy: _, ...signoff } = found;
	return signoff;
}

type Unit = Awaited<ReturnType<typeof unitsOf>>[number];
type Note = Awaited<ReturnType<typeof notesOf>>[number];
type Signoff = Omit<NonNullable<Awaited<ReturnType<typeof signoffOf>>>, "collectedBy">;

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
	const policy: Policy = audiences[scope.audience];
	const [found] = await db
		.select({ id: order.id, customerId: order.customerId, engineer: engineer.name })
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(scope.where);
	if (!found) return undefined;
	const [units, notes, signoff] = await Promise.all([
		unitsOf(found.id, scope.unitsAt, policy.site),
		policy.notes ? notesOf(found.id) : undefined,
		signoffOf(found.id, policy.collectedBy),
	]);
	const record: Record<string, unknown> = {
		units: policy.warranty
			? units
			: units.map((unit) => {
					const { warrantyUntil: _, ...shown } = unit;
					return shown;
				}),
		sites: await sitesOf(units, found.customerId, policy.site),
		signoff,
	};
	if (notes) record.notes = notes;
	if (policy.engineer === "full") record.engineer = found.engineer;
	// Only who's coming, by their first name.
	if (policy.engineer === "first") record.engineer = found.engineer && firstName(found.engineer);
	return record as WorkRecord<A>;
}
