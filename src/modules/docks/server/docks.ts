/**
 * The tenant's dock positions: the sites that have them, a customer's (for its page's card, with
 * what a manager picks from to add one), saving and deleting one, and a unit's dock (for its
 * page). A dock's door, leveller and location must be at its site; its code is unique in the
 * tenant (the Salvo feed names docks by it).
 */
import { and, asc, count, desc, eq, gte, isNull, ne, or } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { customerByCode } from "#lib/customers/server/index.ts";
import { getTimeZone } from "#lib/dates.ts";
import { unitBySerial } from "#lib/equipment/server/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	inTenant,
	tenantJoin,
	sameTenant,
} from "#lib/server/auth/index.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
} from "#lib/server/db/schema.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";

import type { DockInput } from "../form/dock-schema.ts";
import { dockEscalation, dockPosition, dockSession, dockState } from "./schema.ts";

/** What the board and the cards show of a session. */
export const sessionColumns = {
	id: dockSession.id,
	carrier: dockSession.carrier,
	plate: dockSession.plate,
	reference: dockSession.reference,
	slotStart: dockSession.slotStart,
	slotEnd: dockSession.slotEnd,
	checkedInAt: dockSession.checkedInAt,
	lockedAt: dockSession.lockedAt,
	doorOpenedAt: dockSession.doorOpenedAt,
	doorClosedAt: dockSession.doorClosedAt,
	checkedOutAt: dockSession.checkedOutAt,
	doorOpenSeconds: dockSession.doorOpenSeconds,
};

/** The tenant's sites that have docks, with their customer, by customer and site name. */
export function sitesWithDocks() {
	return db
		.selectDistinct({
			id: customerSite.id,
			name: customerSite.name,
			city: customerSite.city,
			customer: { code: customer.code, name: customer.name },
		})
		.from(dockPosition)
		.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(inTenant(dockPosition))
		.orderBy(asc(customer.name), asc(customerSite.name));
}

/** The tenant's docks, for the settings page: with their site and customer. */
export function allDocks() {
	return db
		.select({
			id: dockPosition.id,
			code: dockPosition.code,
			position: dockPosition.position,
			scpCode: dockPosition.scpCode,
			site: { id: customerSite.id, name: customerSite.name },
			customer: { code: customer.code, name: customer.name },
		})
		.from(dockPosition)
		.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(inTenant(dockPosition))
		.orderBy(asc(customer.name), asc(customerSite.name), asc(dockPosition.code));
}

/** The tenant's customer `code`, as this module shows it, or a 404. */
const namedCustomer = (code: string) =>
	customerByCode(code, { id: customer.id, code: customer.code, name: customer.name });

/**
 * A customer's docks, by site, with their live state, and what a dock can be given there: the
 * customer's sites, their locations and their units.
 */
export async function customerDocks(code: string) {
	const found = await namedCustomer(code);
	const sites = await db
		.select({ id: customerSite.id, name: customerSite.name, city: customerSite.city })
		.from(customerSite)
		.where(and(inTenant(customerSite), eq(customerSite.customerId, found.id)))
		.orderBy(asc(customerSite.name));
	const siteIds = sites.map((site) => site.id);
	if (!siteIds.length) return { customer: found, sites, docks: [], locations: [], units: [] };

	const [docks, locations, units] = await Promise.all([
		db
			.select({
				id: dockPosition.id,
				siteId: dockPosition.siteId,
				code: dockPosition.code,
				position: dockPosition.position,
				locationId: dockPosition.locationId,
				doorId: dockPosition.doorId,
				levellerId: dockPosition.levellerId,
				scpCode: dockPosition.scpCode,
				keyId: dockPosition.keyId,
				keyStorageUnit: dockPosition.keyStorageUnit,
				locked: dockState.locked,
				scpOnline: dockState.scpOnline,
				doorOpenSince: dockState.doorOpenSince,
				occupied: dockSession.id,
			})
			.from(dockPosition)
			.leftJoin(
				dockState,
				and(sameTenant(dockState, dockPosition), eq(dockState.dockId, dockPosition.id)),
			)
			.leftJoin(
				dockSession,
				and(
					sameTenant(dockSession, dockPosition),
					eq(dockSession.dockId, dockPosition.id),
					isNull(dockSession.checkedOutAt),
				),
			)
			.where(and(inTenant(dockPosition), inList(dockPosition.siteId, siteIds)))
			.orderBy(asc(dockPosition.code)),
		db
			.select({
				id: equipmentLocation.id,
				siteId: equipmentLocation.siteId,
				name: equipmentLocation.name,
			})
			.from(equipmentLocation)
			.where(and(inTenant(equipmentLocation), inList(equipmentLocation.siteId, siteIds)))
			.orderBy(asc(equipmentLocation.position)),
		db
			.select({
				id: equipment.id,
				siteId: equipment.siteId,
				name: equipment.name,
				serialNumber: equipment.serialNumber,
				category: equipmentCategory.name,
			})
			.from(equipment)
			.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
			.where(and(inTenant(equipment), inList(equipment.siteId, siteIds)))
			.orderBy(asc(equipment.name), asc(equipment.serialNumber)),
	]);
	return {
		customer: found,
		sites,
		docks: docks.map(({ occupied, ...dock }) => ({ ...dock, occupied: occupied !== null })),
		locations,
		units,
	};
}

/** What's wrong with a dock's references and code, by field. */
async function dockProblems(input: DockInput, customerId: number, id?: number) {
	const problems: Problem[] = [];
	const [site] = await db
		.select({ id: customerSite.id })
		.from(customerSite)
		.where(and(idInTenant(customerSite, input.siteId), eq(customerSite.customerId, customerId)));
	if (!site) return [{ path: ["siteId"], message: m.docks_unknown_site() }];

	const unitIds = [input.doorId, input.levellerId].filter((unit) => unit !== null);
	const [units, location, taken] = await Promise.all([
		unitIds.length
			? db
					.select({ id: equipment.id })
					.from(equipment)
					.where(
						and(
							inTenant(equipment),
							inList(equipment.id, unitIds),
							eq(equipment.siteId, input.siteId),
						),
					)
			: [],
		input.locationId
			? db
					.select({ id: equipmentLocation.id })
					.from(equipmentLocation)
					.where(
						and(
							idInTenant(equipmentLocation, input.locationId),
							eq(equipmentLocation.siteId, input.siteId),
						),
					)
			: [],
		db
			.select({ id: dockPosition.id })
			.from(dockPosition)
			.where(
				and(
					inTenant(dockPosition),
					eq(dockPosition.code, input.code),
					...(id ? [ne(dockPosition.id, id)] : []),
				),
			),
	]);
	const here = new Set(units.map((unit) => unit.id));
	if (input.doorId && !here.has(input.doorId)) {
		problems.push({ path: ["doorId"], message: m.docks_unit_elsewhere() });
	}
	if (input.levellerId && !here.has(input.levellerId)) {
		problems.push({ path: ["levellerId"], message: m.docks_unit_elsewhere() });
	}
	if (input.locationId && !location.length) {
		problems.push({ path: ["locationId"], message: m.docks_location_elsewhere() });
	}
	if (taken.length) problems.push({ path: ["code"], message: m.docks_code_taken() });
	return problems;
}

/** The columns a dock's form sets, with the tenant columns of its optional references. */
function dockValues(input: DockInput) {
	return {
		siteId: input.siteId,
		code: input.code,
		position: input.position,
		...withTenantRefs(currentTenant().organizationId, {
			locationId: input.locationId,
			doorId: input.doorId,
			levellerId: input.levellerId,
		}),
		scpCode: input.scpCode,
		keyId: input.keyId,
		keyStorageUnit: input.keyStorageUnit,
	};
}

/** What the log compares of a dock. */
const loggedFields = [
	"siteId",
	"code",
	"position",
	"locationId",
	"doorId",
	"levellerId",
	"scpCode",
	"keyId",
	"keyStorageUnit",
] as const;
const logged = (values: Record<(typeof loggedFields)[number], unknown>) =>
	Object.fromEntries(loggedFields.map((field) => [field, values[field]]));

/**
 * Adds a dock at a site of the customer `customerCode` (with `input.id`, saves that dock), and logs
 * it. Refuses what's wrong with it, on the form's fields; a 404 for another tenant's customer or
 * dock.
 */
export async function saveDock(customerCode: string, input: DockInput & { id?: number }) {
	const owner = await namedCustomer(customerCode);
	Refused.check(await dockProblems(input, owner.id, input.id));
	const values = dockValues(input);
	const { organizationId } = currentTenant();
	const parent = customerSubject(owner);
	await db.transaction(async (tx) => {
		if (input.id) {
			const before = orNotFound(
				await tx
					.select()
					.from(dockPosition)
					.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
					.where(and(idInTenant(dockPosition, input.id), eq(customerSite.customerId, owner.id))),
				m.docks_not_found(),
			);
			await tx.update(dockPosition).set(values).where(idInTenant(dockPosition, input.id));
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "dock", id: input.id, label: input.code },
				parent,
				before: logged(before.dock_position),
				after: logged(values),
			});
		} else {
			const [row] = await tx
				.insert(dockPosition)
				.values({ ...values, organizationId })
				.returning({ id: dockPosition.id });
			await recordActivity(tx, {
				action: "created",
				subject: { type: "dock", id: row.id, label: input.code },
				parent,
				after: logged(values),
			});
		}
	});
}

/** Deletes the customer's dock `id` (its state, sessions and events with it), and logs it. */
export async function deleteDock(customerCode: string, id: number) {
	const owner = await namedCustomer(customerCode);
	return db.transaction(async (tx) => {
		const found = orNotFound(
			await tx
				.select({ code: dockPosition.code })
				.from(dockPosition)
				.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
				.where(and(idInTenant(dockPosition, id), eq(customerSite.customerId, owner.id))),
			m.docks_not_found(),
		);
		await deleteAndLog(dockPosition, {
			tx,
			subject: { type: "dock", id, label: found.code },
			parent: customerSubject(owner),
		});
		return found;
	});
}

/**
 * How the unit with `serialNumber` is used as a dock's door or leveller: the dock, its sessions
 * today (in the user's time zone), the average door-open time of its sessions over the last 30
 * days, and the open breakdown orders the door rules made on it. None if it's no dock's.
 */
export async function dockUsage(serialNumber: string) {
	const unit = await unitBySerial(serialNumber);
	const [dock] = await db
		.select({
			id: dockPosition.id,
			code: dockPosition.code,
			position: dockPosition.position,
			doorId: dockPosition.doorId,
			site: customerSite.name,
		})
		.from(dockPosition)
		.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
		.where(
			and(
				inTenant(dockPosition),
				or(eq(dockPosition.doorId, unit.id), eq(dockPosition.levellerId, unit.id)),
			),
		)
		.limit(1);
	if (!dock) return null;

	const now = Temporal.Now.zonedDateTimeISO(getTimeZone());
	const startOfToday = now.startOfDay().toInstant();
	const monthAgo = now.toInstant().subtract({ hours: 30 * 24 });
	const ofDock = and(inTenant(dockSession), eq(dockSession.dockId, dock.id));
	const [[today], recent, orders] = await Promise.all([
		db
			.select({ sessions: count() })
			.from(dockSession)
			.where(and(ofDock, gte(dockSession.checkedInAt, startOfToday))),
		db
			.select({ seconds: dockSession.doorOpenSeconds })
			.from(dockSession)
			.where(and(ofDock, gte(dockSession.checkedInAt, monthAgo)))
			.orderBy(desc(dockSession.checkedInAt)),
		dock.doorId === unit.id
			? db
					.select({ number: order.number })
					.from(dockEscalation)
					.innerJoin(...tenantJoin(order, dockEscalation.orderId))
					.where(
						and(
							inTenant(dockEscalation),
							eq(dockEscalation.equipmentId, unit.id),
							inList(order.status, [...openOrderStatuses]),
						),
					)
			: [],
	]);
	const average = recent.length
		? Math.round(recent.reduce((sum, row) => sum + row.seconds, 0) / recent.length)
		: null;
	return {
		dock: { code: dock.code, position: dock.position, site: dock.site },
		role: dock.doorId === unit.id ? ("door" as const) : ("leveller" as const),
		sessionsToday: today.sessions,
		recentSessions: recent.length,
		averageOpenSeconds: average,
		openOrders: orders.map((row) => row.number),
	};
}

/**
 * The dock whose door is the unit `unitId`, with its live state, as a card elsewhere shows it (the
 * energy module's door, `energy.door`): its code, its site (for the board's link), whether it has
 * reported, the Wheel-Lok, its SCP and the plate of the truck at it. None if the unit is no dock's
 * door (a leveller isn't one).
 */
export async function doorDock(unitId: number) {
	const [dock] = await db
		.select({
			code: dockPosition.code,
			siteId: dockPosition.siteId,
			locked: dockState.locked,
			scpOnline: dockState.scpOnline,
			doorOpenSince: dockState.doorOpenSince,
			sessionId: dockSession.id,
			plate: dockSession.plate,
		})
		.from(dockPosition)
		.leftJoin(
			dockState,
			and(sameTenant(dockState, dockPosition), eq(dockState.dockId, dockPosition.id)),
		)
		.leftJoin(
			dockSession,
			and(
				sameTenant(dockSession, dockPosition),
				eq(dockSession.dockId, dockPosition.id),
				isNull(dockSession.checkedOutAt),
			),
		)
		.where(and(inTenant(dockPosition), eq(dockPosition.doorId, unitId)))
		.orderBy(asc(dockPosition.code))
		.limit(1);
	if (!dock) return null;
	const { sessionId, locked, scpOnline, ...rest } = dock;
	return {
		...rest,
		// A dock without events has no state yet (no row to join).
		reported: locked !== null,
		locked: locked ?? false,
		scpOnline: scpOnline ?? true,
		occupied: sessionId !== null,
	};
}
