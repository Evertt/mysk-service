/**
 * Setting a site's energy monitoring up in the office (managers, `../setup/`): an energy site for
 * one of a customer's sites (its contract, solar panels, tariff, CO₂ factor and time zone), and its
 * zones, consumers and monitored doors. Zone and door codes are unique in their site, as the
 * gateway names them by them (`../ingest/format.ts`); a consumer's or a door's unit is one of the
 * site's. Ids come from the client: a site of another tenant is a 404, a zone or unit that isn't the
 * site's a problem on its field.
 *
 * Measurements aren't deleted with what they measure: a zone with readings or alerts, a door with
 * events or alerts and a site with any of them can't be deleted (their keys would cascade), and the
 * refusal says so. There's no archive: such a record stays, renamed or with its thresholds off. A
 * zone's thresholds aren't set here: a new zone has none until a manager sets them on the
 * thresholds page, or its first day of readings gives it §2.5's defaults (`thresholds.ts`).
 *
 * Every change is logged in its transaction, against the energy site (the parent of its zones',
 * consumers' and doors' entries).
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { customerByCode } from "#lib/customers/server/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentCategory } from "#lib/server/db/schema.ts";
import { deleteAndLog, nextPosition, orNotFound } from "#lib/server/records.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";

import type {
	ConsumerInput,
	DoorInput,
	EnergySiteInput,
	NewEnergySiteInput,
	ZoneInput,
} from "../setup/setup-schema.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyDoorEvent,
	energyReading,
	energySite,
	energyZone,
} from "./schema.ts";

// --- Sites -------------------------------------------------------------------------------------

/** The tenant's customer `code`, as this module shows it, or a 404. */
const namedCustomer = (code: string) =>
	customerByCode(code, { id: customer.id, code: customer.code, name: customer.name });

/** The `.leftJoin()` of each customer site's energy site, in the tenant. */
const energyOfSite = () =>
	[energySite, and(eq(energySite.siteId, customerSite.id), inTenant(energySite))] as const;

/** The customer's sites, each with its energy site (with how many zones and doors) if it has one. */
export async function customerEnergy(code: string) {
	const found = await namedCustomer(code);
	const sites = await db
		.select({
			id: customerSite.id,
			name: customerSite.name,
			city: customerSite.city,
			energySiteId: energySite.id,
			energyName: energySite.name,
			zones: sql<number>`(select count(*) from ${energyZone} where ${energyZone.energySiteId} = ${energySite.id})`,
			doors: sql<number>`(select count(*) from ${energyDoor} where ${energyDoor.energySiteId} = ${energySite.id})`,
		})
		.from(customerSite)
		.leftJoin(...energyOfSite())
		.where(and(inTenant(customerSite), eq(customerSite.customerId, found.id)))
		.orderBy(asc(customerSite.name));
	return {
		customer: found,
		sites: sites.map(({ energySiteId, energyName, zones, doors, ...site }) => ({
			...site,
			energy:
				energySiteId === null ? null : { id: energySiteId, name: energyName ?? "", zones, doors },
		})),
	};
}

/** The tenant's customer sites that have no energy site yet, by customer and site. */
export function siteChoices() {
	return db
		.select({
			id: customerSite.id,
			name: customerSite.name,
			city: customerSite.city,
			customer: customer.name,
		})
		.from(customerSite)
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.leftJoin(...energyOfSite())
		.where(and(inTenant(customerSite), isNull(energySite.id)))
		.orderBy(asc(customer.name), asc(customerSite.name));
}

/** What the log compares of a site. */
const siteLogged = (site: EnergySiteInput) => ({
	name: site.name,
	meterName: site.meterName,
	contractedPeakKw: site.contractedPeakKw,
	contractedKwhPerYear: site.contractedKwhPerYear,
	pvCapacityKw: site.pvCapacityKw,
	tariff: site.tariff,
	co2Factor: site.co2Factor,
	timeZone: site.timeZone,
});

/**
 * Adds an energy site for the tenant's customer site `input.siteId` (a 404 for another tenant's),
 * and logs it. Answers its id; refuses a site that has one already.
 */
export async function createEnergySite(input: NewEnergySiteInput): Promise<{ id: number }> {
	const site = orNotFound(
		await db
			.select({ id: customerSite.id, name: customerSite.name, customer: customer.name })
			.from(customerSite)
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(idInTenant(customerSite, input.siteId)),
		m.energy_setup_site_not_found(),
	);
	const values = siteLogged({
		...input,
		name: input.name ?? `${site.customer} — ${site.name}`,
		meterName: input.meterName ?? m.energy_setup_default_meter(),
	});
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const [taken] = await tx
			.select({ id: energySite.id })
			.from(energySite)
			.where(and(inTenant(energySite), eq(energySite.siteId, site.id)));
		if (taken) throw new Refused({ path: ["siteId"], message: m.energy_setup_site_taken() });
		const [row] = await tx
			.insert(energySite)
			.values({ organizationId, siteId: site.id, ...values })
			.returning({ id: energySite.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_site", id: row.id, label: values.name },
			after: values,
		});
		return { id: row.id };
	});
}

/** The tenant's energy site `id`, as stored, or a 404. */
async function siteRow(id: number, tx: Transaction | typeof db = db) {
	return orNotFound(
		await tx.select().from(energySite).where(idInTenant(energySite, id)),
		m.energy_site_not_found(),
	);
}

/** The energy site as the log names it, the parent of its zones', consumers' and doors' entries. */
const siteSubject = (site: { id: number; name: string }): Subject => ({
	type: "energy_site",
	id: site.id,
	label: site.name,
});

/** Saves the energy site `id`'s settings, and logs what changed. */
export async function updateEnergySite(id: number, input: EnergySiteInput) {
	const after = siteLogged(input);
	await db.transaction(async (tx) => {
		const before = await siteRow(id, tx);
		await tx.update(energySite).set(after).where(idInTenant(energySite, id));
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "energy_site", id, label: after.name },
			before,
			after,
		});
	});
}

/** Whether `query` (a select of one column) finds a row. */
const exists = async (query: Promise<unknown[]>) => (await query).length > 0;

/**
 * Whether the energy site has readings, door events or alerts. Asked in the deleting transaction:
 * transactions take turns, so no batch is stored between the answer and the delete.
 */
async function siteMeasured(tx: Transaction, id: number) {
	const [readings, events, alerts] = await Promise.all([
		exists(
			tx
				.select({ zoneId: energyReading.zoneId })
				.from(energyReading)
				.innerJoin(...tenantJoin(energyZone, energyReading.zoneId))
				.where(and(inTenant(energyReading), eq(energyZone.energySiteId, id)))
				.limit(1),
		),
		exists(
			tx
				.select({ doorId: energyDoorEvent.doorId })
				.from(energyDoorEvent)
				.innerJoin(...tenantJoin(energyDoor, energyDoorEvent.doorId))
				.where(and(inTenant(energyDoorEvent), eq(energyDoor.energySiteId, id)))
				.limit(1),
		),
		exists(
			tx
				.select({ id: energyAlert.id })
				.from(energyAlert)
				.where(and(inTenant(energyAlert), eq(energyAlert.energySiteId, id)))
				.limit(1),
		),
	]);
	return readings || events || alerts;
}

/**
 * Deletes the energy site `id` with its zones, consumers, doors and thresholds, and logs it; refused
 * (the problem answered) while it has measurements or alerts.
 */
export async function deleteEnergySite(id: number) {
	const site = await siteRow(id);
	await db.transaction(async (tx) => {
		if (await siteMeasured(tx, id)) throw new Refused(m.energy_setup_site_measured());
		await deleteAndLog(energySite, { tx, subject: { type: "energy_site", id, label: site.name } });
	});
}

/** The site's setup: its settings, zones, consumers and doors, and the units they can be. */
export async function siteSetup(id: number) {
	const site = await siteRow(id);
	const [place, zones, consumers, doors, units] = await Promise.all([
		db
			.select({
				siteName: customerSite.name,
				city: customerSite.city,
				customerName: customer.name,
				customerCode: customer.code,
			})
			.from(customerSite)
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(idInTenant(customerSite, site.siteId)),
		db
			.select({
				id: energyZone.id,
				code: energyZone.code,
				name: energyZone.name,
				floor: energyZone.floor,
				areaM2: energyZone.areaM2,
			})
			.from(energyZone)
			.where(and(inTenant(energyZone), eq(energyZone.energySiteId, id)))
			.orderBy(asc(energyZone.position), asc(energyZone.id)),
		db
			.select({
				id: energyConsumer.id,
				zoneId: energyConsumer.zoneId,
				name: energyConsumer.name,
				ratedKw: energyConsumer.ratedKw,
				equipmentId: energyConsumer.equipmentId,
			})
			.from(energyConsumer)
			.innerJoin(...tenantJoin(energyZone, energyConsumer.zoneId))
			.where(and(inTenant(energyConsumer), eq(energyZone.energySiteId, id)))
			.orderBy(asc(energyZone.position), asc(energyConsumer.position), asc(energyConsumer.id)),
		db
			.select({
				id: energyDoor.id,
				zoneId: energyDoor.zoneId,
				code: energyDoor.code,
				name: energyDoor.name,
				kind: energyDoor.kind,
				lossKw: energyDoor.lossKw,
				thresholdMinutes: energyDoor.thresholdMinutes,
				insideC: energyDoor.insideC,
				outsideC: energyDoor.outsideC,
				equipmentId: energyDoor.equipmentId,
			})
			.from(energyDoor)
			.where(and(inTenant(energyDoor), eq(energyDoor.energySiteId, id)))
			.orderBy(asc(energyDoor.code)),
		siteUnits(site.siteId),
	]);
	return { site: { ...site, ...place[0] }, zones, consumers, doors, units };
}

/** The units at the customer site `siteId`, which a consumer or a door can be. */
const siteUnits = (siteId: number) =>
	db
		.select({
			id: equipment.id,
			name: equipment.name,
			serialNumber: equipment.serialNumber,
			category: equipmentCategory.name,
		})
		.from(equipment)
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.where(and(inTenant(equipment), eq(equipment.siteId, siteId)))
		.orderBy(asc(equipment.name), asc(equipment.serialNumber));

// --- Zones, consumers and doors ------------------------------------------------------------------

/** The zone `zoneId` of the energy site `siteId`, if it's one of its. */
async function zoneOf(siteId: number, zoneId: number, tx: Transaction | typeof db = db) {
	const [found] = await tx
		.select()
		.from(energyZone)
		.where(and(idInTenant(energyZone, zoneId), eq(energyZone.energySiteId, siteId)));
	return found;
}

/** Whether the unit `unitId` is at the customer site `customerSiteId`, in the tenant. */
async function unitAtSite(customerSiteId: number, unitId: number) {
	return exists(
		db
			.select({ id: equipment.id })
			.from(equipment)
			.where(and(idInTenant(equipment, unitId), eq(equipment.siteId, customerSiteId))),
	);
}

/** A unit's columns, with its tenant (see `./schema.ts`). */
function unitColumns(unitId: number | null) {
	return withTenantRefs(currentTenant().organizationId, { equipmentId: unitId });
}

/** Whether another of the site's zones (or doors) than `except` has `code`. */
async function codeTaken(
	table: typeof energyZone | typeof energyDoor,
	siteId: number,
	code: string,
	except: number | null,
) {
	return exists(
		db
			.select({ id: table.id })
			.from(table)
			.where(
				and(
					inTenant(table),
					eq(table.energySiteId, siteId),
					eq(table.code, code),
					...(except ? [ne(table.id, except)] : []),
				),
			),
	);
}

/** What the log compares of a zone. */
const zoneLogged = (zone: Omit<ZoneInput, "zoneId">) => ({
	code: zone.code,
	name: zone.name,
	floor: zone.floor,
	areaM2: zone.areaM2,
});

/**
 * Adds a zone to the energy site `siteId` (with `input.zoneId`, saves that zone of it), and logs it.
 * Refuses a code the site has already. A new zone comes last, without thresholds.
 */
export async function saveZone(siteId: number, input: ZoneInput) {
	const site = await siteRow(siteId);
	const before = input.zoneId ? await zoneOf(site.id, input.zoneId) : undefined;
	if (input.zoneId && !before) error(404, m.energy_zone_not_found());
	if (await codeTaken(energyZone, site.id, input.code, input.zoneId)) {
		throw new Refused({ path: ["code"], message: m.energy_setup_zone_code_taken() });
	}
	const values = zoneLogged(input);
	await db.transaction(async (tx) => {
		if (before) {
			await tx.update(energyZone).set(values).where(idInTenant(energyZone, before.id));
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "energy_zone", id: before.id, label: values.code },
				parent: siteSubject(site),
				before,
				after: values,
			});
			return;
		}
		const position = await nextPosition(tx, energyZone, eq(energyZone.energySiteId, site.id));
		const [row] = await tx
			.insert(energyZone)
			.values({
				organizationId: currentTenant().organizationId,
				energySiteId: site.id,
				position,
				...values,
			})
			.returning({ id: energyZone.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_zone", id: row.id, label: values.code },
			parent: siteSubject(site),
			after: values,
		});
	});
}

/**
 * Deletes the zone `zoneId` of the energy site `siteId`, with its consumers, doors and thresholds,
 * and logs it; refused while it has readings or alerts, or its doors events.
 */
export async function deleteZone(siteId: number, zoneId: number) {
	const site = await siteRow(siteId);
	const zone = orNotFound(await zoneOf(site.id, zoneId), m.energy_zone_not_found());
	await db.transaction(async (tx) => {
		if (await zoneMeasured(tx, zone.id)) throw new Refused(m.energy_setup_zone_measured());
		await deleteAndLog(energyZone, {
			tx,
			subject: { type: "energy_zone", id: zone.id, label: zone.code },
			parent: siteSubject(site),
		});
	});
}

/** Whether the zone has readings or alerts, or its doors events (asked as `siteMeasured()` is). */
async function zoneMeasured(tx: Transaction, zoneId: number) {
	const [readings, events, alerts] = await Promise.all([
		exists(
			tx
				.select({ zoneId: energyReading.zoneId })
				.from(energyReading)
				.where(and(inTenant(energyReading), eq(energyReading.zoneId, zoneId)))
				.limit(1),
		),
		exists(
			tx
				.select({ doorId: energyDoorEvent.doorId })
				.from(energyDoorEvent)
				.innerJoin(...tenantJoin(energyDoor, energyDoorEvent.doorId))
				.where(and(inTenant(energyDoorEvent), eq(energyDoor.zoneId, zoneId)))
				.limit(1),
		),
		exists(
			tx
				.select({ id: energyAlert.id })
				.from(energyAlert)
				.where(and(inTenant(energyAlert), eq(energyAlert.zoneId, zoneId)))
				.limit(1),
		),
	]);
	return readings || events || alerts;
}

/** The consumer `consumerId` of the energy site `siteId` (in one of its zones), with its zone's code. */
async function consumerOf(siteId: number, consumerId: number) {
	const [found] = await db
		.select({ consumer: energyConsumer, zone: energyZone.code })
		.from(energyConsumer)
		.innerJoin(...tenantJoin(energyZone, energyConsumer.zoneId))
		.where(and(idInTenant(energyConsumer, consumerId), eq(energyZone.energySiteId, siteId)));
	return found;
}

/**
 * Adds a consumer to a zone of the energy site `siteId` (with `input.consumerId`, saves that one),
 * and logs it. Refuses a zone or a unit that isn't the site's.
 */
export async function saveConsumer(siteId: number, input: ConsumerInput) {
	const site = await siteRow(siteId);
	const found = input.consumerId ? await consumerOf(site.id, input.consumerId) : undefined;
	if (input.consumerId && !found) error(404, m.energy_setup_consumer_not_found());
	const [zone, unitHere] = await Promise.all([
		zoneOf(site.id, input.zoneId),
		input.equipmentId ? unitAtSite(site.siteId, input.equipmentId) : true,
	]);
	const problems: Problem[] = [];
	if (!zone) problems.push({ path: ["zoneId"], message: m.energy_setup_zone_elsewhere() });
	if (!unitHere) problems.push({ path: ["equipmentId"], message: m.energy_setup_unit_elsewhere() });
	Refused.check(problems);
	if (!zone) return;

	const values = {
		zoneId: zone.id,
		name: input.name,
		ratedKw: input.ratedKw,
		...unitColumns(input.equipmentId),
	};
	const logged = {
		zone: zone.code,
		name: input.name,
		ratedKw: input.ratedKw,
		equipmentId: input.equipmentId,
	};
	await db.transaction(async (tx) => {
		if (found) {
			const { consumer } = found;
			await tx.update(energyConsumer).set(values).where(idInTenant(energyConsumer, consumer.id));
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "energy_consumer", id: consumer.id, label: input.name },
				parent: siteSubject(site),
				before: { ...consumer, zone: found.zone },
				after: logged,
			});
			return;
		}
		const position = await nextPosition(tx, energyConsumer, eq(energyConsumer.zoneId, zone.id));
		const [row] = await tx
			.insert(energyConsumer)
			.values({
				organizationId: currentTenant().organizationId,
				position,
				...values,
			})
			.returning({ id: energyConsumer.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_consumer", id: row.id, label: input.name },
			parent: siteSubject(site),
			after: logged,
		});
	});
}

/** Deletes the consumer `consumerId` of the energy site `siteId`, and logs it. */
export async function deleteConsumer(siteId: number, consumerId: number) {
	const site = await siteRow(siteId);
	const found = orNotFound(
		await consumerOf(site.id, consumerId),
		m.energy_setup_consumer_not_found(),
	);
	await deleteAndLog(energyConsumer, {
		subject: { type: "energy_consumer", id: found.consumer.id, label: found.consumer.name },
		parent: siteSubject(site),
	});
}

/** The door `doorId` of the energy site `siteId`, with its zone's code. */
async function doorOf(siteId: number, doorId: number) {
	const [found] = await db
		.select({ door: energyDoor, zone: energyZone.code })
		.from(energyDoor)
		.innerJoin(...tenantJoin(energyZone, energyDoor.zoneId))
		.where(and(idInTenant(energyDoor, doorId), eq(energyDoor.energySiteId, siteId)));
	return found;
}

/**
 * Adds a monitored door to a zone of the energy site `siteId` (with `input.doorId`, saves that one),
 * and logs it. Refuses a zone or a unit that isn't the site's, or a code another of its doors has.
 */
export async function saveDoor(siteId: number, input: DoorInput) {
	const site = await siteRow(siteId);
	const found = input.doorId ? await doorOf(site.id, input.doorId) : undefined;
	if (input.doorId && !found) error(404, m.energy_setup_door_not_found());
	const [zone, unitHere, taken] = await Promise.all([
		zoneOf(site.id, input.zoneId),
		input.equipmentId ? unitAtSite(site.siteId, input.equipmentId) : true,
		codeTaken(energyDoor, site.id, input.code, input.doorId),
	]);
	const problems: Problem[] = [];
	if (!zone) problems.push({ path: ["zoneId"], message: m.energy_setup_zone_elsewhere() });
	if (!unitHere) problems.push({ path: ["equipmentId"], message: m.energy_setup_unit_elsewhere() });
	if (taken) problems.push({ path: ["code"], message: m.energy_setup_door_code_taken() });
	Refused.check(problems);
	if (!zone) return;

	const fields = {
		code: input.code,
		name: input.name,
		kind: input.kind,
		lossKw: input.lossKw,
		thresholdMinutes: input.thresholdMinutes,
		insideC: input.insideC ?? null,
		outsideC: input.outsideC ?? null,
	};
	const values = { zoneId: zone.id, ...fields, ...unitColumns(input.equipmentId) };
	const logged = { zone: zone.code, ...fields, equipmentId: input.equipmentId };
	await db.transaction(async (tx) => {
		if (found) {
			const { door } = found;
			await tx.update(energyDoor).set(values).where(idInTenant(energyDoor, door.id));
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "energy_door", id: door.id, label: input.code },
				parent: siteSubject(site),
				before: { ...door, zone: found.zone },
				after: logged,
			});
			return;
		}
		const [row] = await tx
			.insert(energyDoor)
			.values({ organizationId: currentTenant().organizationId, energySiteId: site.id, ...values })
			.returning({ id: energyDoor.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_door", id: row.id, label: input.code },
			parent: siteSubject(site),
			after: logged,
		});
	});
}

/**
 * Deletes the door `doorId` of the energy site `siteId`, and logs it; refused while it has events or
 * alerts.
 */
export async function deleteDoor(siteId: number, doorId: number) {
	const site = await siteRow(siteId);
	const found = orNotFound(await doorOf(site.id, doorId), m.energy_setup_door_not_found());
	const { door } = found;
	await db.transaction(async (tx) => {
		if (await doorMeasured(tx, door.id)) throw new Refused(m.energy_setup_door_measured());
		await deleteAndLog(energyDoor, {
			tx,
			subject: { type: "energy_door", id: door.id, label: door.code },
			parent: siteSubject(site),
		});
	});
}

/** Whether the door has events or alerts (asked as `siteMeasured()` is). */
async function doorMeasured(tx: Transaction, doorId: number) {
	const [events, alerts] = await Promise.all([
		exists(
			tx
				.select({ doorId: energyDoorEvent.doorId })
				.from(energyDoorEvent)
				.where(and(inTenant(energyDoorEvent), eq(energyDoorEvent.doorId, doorId)))
				.limit(1),
		),
		exists(
			tx
				.select({ id: energyAlert.id })
				.from(energyAlert)
				.where(and(inTenant(energyAlert), eq(energyAlert.doorId, doorId)))
				.limit(1),
		),
	]);
	return events || alerts;
}
