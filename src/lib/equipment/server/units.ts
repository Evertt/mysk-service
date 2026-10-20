/**
 * Units and locations as an audience sees them: the office, a field engineer (the engineer portal,
 * where a scanned QR code leads them) or a customer's contact (the customer portal). Who sees what
 * is declared once, in `audiences`, as the work record's is (`readWorkRecord()`, whose units are
 * these); a scope picks the rows the audience may see, and `readUnits()` and `readLocation()` read
 * what it sees of them. Only the scopes below make one, so a portal can't read the office's view.
 */
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { type SiteDetail, siteColumns } from "#lib/customers/server/index.ts";
import {
	atSites,
	type CustomerAccess,
	idInTenant,
	inTenant,
	ofCustomer,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
} from "#lib/server/db/schema.ts";

/** What an audience sees of a unit or location. */
interface Policy {
	/** Of a site, what's needed on it (contacts, time slot, access) or only its address. */
	site: SiteDetail;
	/** Whose site it is (a contact knows: their own customer's). */
	owner: boolean;
	/** Until when each unit is under warranty. */
	warranty: boolean;
	/** A location's QR code, which only the office prints. */
	qrToken: boolean;
}

/** What each audience sees of the units and locations: the only place it's declared. */
const audiences = {
	office: { site: "onSite", owner: true, warranty: true, qrToken: true },
	engineer: { site: "onSite", owner: true, warranty: false, qrToken: false },
	customer: { site: "address", owner: false, warranty: false, qrToken: false },
} as const satisfies Record<string, Policy>;

export type UnitAudience = keyof typeof audiences;

type PolicyOf<A extends UnitAudience> = (typeof audiences)[A];

declare const scoped: unique symbol;

/** Which units and sites, and who reads them: made only by the scopes below. */
export interface UnitScope<A extends UnitAudience> {
	readonly [scoped]: A;
	readonly audience: A;
	/** Picks the units the audience sees, on `equipment`. */
	readonly units: SQL;
	/** Picks the sites the audience sees (and so their locations), on `customerSite`. */
	readonly sites: SQL;
}

const scope = <A extends UnitAudience>(audience: A, units: SQL, sites: SQL) =>
	({ audience, units, sites }) as UnitScope<A>;

/** The tenant's units, as the office sees them. */
export const officeUnits = () => scope("office", inTenant(equipment), inTenant(customerSite));

/**
 * The tenant's units, as a field engineer sees them: any of them, as a QR code anywhere leads them
 * to it; their own orders on it are theirs to scope (`engineerOrders()`).
 */
export const engineerUnits = () => scope("engineer", inTenant(equipment), inTenant(customerSite));

/** The customer's units the contact sees: at the sites they see. */
export const customerUnits = (access: CustomerAccess) =>
	scope(
		"customer",
		and(ofCustomer(access, equipment), atSites(access, equipment.siteId))!,
		and(ofCustomer(access, customerSite), atSites(access, customerSite.id))!,
	);

/** Whose a site is, as the office's links name a customer. */
const ownerColumns = { id: customer.id, code: customer.code, name: customer.name };

/** A unit's own columns, what every audience sees of it. */
const ownColumns = {
	id: equipment.id,
	serialNumber: equipment.serialNumber,
	name: equipment.name,
	manufacturer: equipment.manufacturer,
	model: equipment.model,
	status: equipment.status,
	category: equipmentCategory.name,
	locationId: equipment.locationId,
	/** Where it is at its site, if that needs saying (left joined: typed as such). */
	location: sql<string | null>`${equipmentLocation.name}`,
};

/** The columns of a site as audience `A` sees it. */
type SiteColumns<A extends UnitAudience> = (typeof siteColumns)[PolicyOf<A>["site"]] &
	(PolicyOf<A>["owner"] extends true ? { customer: typeof ownerColumns } : {});

/** The columns of a unit as audience `A` sees it, its site's among them. */
type UnitColumns<A extends UnitAudience> = typeof ownColumns & {
	site: SiteColumns<A>;
} & (PolicyOf<A>["warranty"] extends true ? { warrantyUntil: typeof equipment.warrantyUntil } : {});

/** A site as audience `A` sees it. */
export type SiteOf<A extends UnitAudience> = SelectResultFields<SiteColumns<A>>;

/** A unit as audience `A` sees it: a key its policy says no to isn't in the type. */
export type UnitOf<A extends UnitAudience> = SelectResultFields<UnitColumns<A>>;

/** The columns of a site as `audience` sees it, for a query joined by `withUnitDetails()`. */
export function siteColumnsOf<A extends UnitAudience>(audience: A): SiteColumns<A> {
	const policy: Policy = audiences[audience];
	return {
		...siteColumns[policy.site],
		...(policy.owner && { customer: ownerColumns }),
	} as SiteColumns<A>;
}

/**
 * The columns of a unit as `audience` sees it, for a query on `equipment` joined by
 * `withUnitDetails()`: its category, location and site (`listedUnitsOf()`'s `columns`, too).
 */
export function unitColumns<A extends UnitAudience>(audience: A): UnitColumns<A> {
	const policy: Policy = audiences[audience];
	return {
		...ownColumns,
		site: siteColumnsOf(audience),
		...(policy.warranty && { warrantyUntil: equipment.warrantyUntil }),
	} as UnitColumns<A>;
}

/**
 * What the scope's audience sees of the units of orders, those it sees:
 * `listedUnitsOf(orderIds, seenBy(scope))` (`#lib/orders/server`).
 */
export const seenBy = <A extends UnitAudience>(scope: UnitScope<A>) => ({
	columns: unitColumns(scope.audience),
	where: scope.units,
});

/** A query on `equipment` (of the tenant's) joined to what `unitColumns()` read of a unit. */
export const withUnitDetails = <Q extends SQLiteSelect>(query: Q) =>
	query
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId));

/**
 * The units the scope sees for which `where` holds (on `equipment`), as its audience sees them: as
 * the customer names them, else by make, as the order form and the equipment list have them.
 */
export async function readUnits<A extends UnitAudience>(
	scope: UnitScope<A>,
	where?: SQL,
): Promise<UnitOf<A>[]> {
	const rows = await withUnitDetails(
		db.select(unitColumns(scope.audience)).from(equipment).$dynamic(),
	)
		.where(and(scope.units, where))
		.orderBy(
			asc(sql`coalesce(${equipment.name}, ${equipment.manufacturer}) collate nocase`),
			asc(equipment.model),
			asc(equipment.serialNumber),
		);
	return rows as UnitOf<A>[];
}

/** The locations at the sites the scope sees (and `where` holds for), in the order the office keeps. */
export const readLocations = <A extends UnitAudience>(scope: UnitScope<A>, where?: SQL) =>
	db
		.select({
			id: equipmentLocation.id,
			name: equipmentLocation.name,
			siteId: equipmentLocation.siteId,
		})
		.from(equipmentLocation)
		.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
		.where(and(inTenant(equipmentLocation), scope.sites, where))
		.orderBy(asc(equipmentLocation.position), asc(equipmentLocation.id));

/** A location as audience `A` sees it, with its site. */
export type LocationOf<A extends UnitAudience> = {
	id: number;
	name: string;
	description: string | null;
	site: SiteOf<A>;
} & (PolicyOf<A>["qrToken"] extends true ? { qrToken: string } : {});

/**
 * The location `id` at a site the scope sees, as its audience sees it, with its site and the units
 * there it sees (`readUnits()`); `undefined` for any other (the caller 404s, with its message).
 */
export async function readLocation<A extends UnitAudience>(
	scope: UnitScope<A>,
	id: number,
): Promise<{ location: LocationOf<A>; units: UnitOf<A>[] } | undefined> {
	const policy: Policy = audiences[scope.audience];
	const [location] = await db
		.select({
			id: equipmentLocation.id,
			name: equipmentLocation.name,
			description: equipmentLocation.description,
			// Typed as any audience's: the result is `LocationOf<A>`.
			site: siteColumnsOf<UnitAudience>(scope.audience),
			...(policy.qrToken && { qrToken: equipmentLocation.qrToken }),
		})
		.from(equipmentLocation)
		.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(and(idInTenant(equipmentLocation, id), scope.sites));
	if (!location) return undefined;
	const units = await readUnits(scope, eq(equipment.locationId, location.id));
	return { location: location as LocationOf<A>, units };
}
