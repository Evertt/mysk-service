/**
 * Setting a site's energy monitoring up in the office (managers, `../setup/`): an energy site for
 * one of a customer's sites (its contract, solar panels, tariff, CO₂ factor and time zone); its
 * zones, consumers and doors are `./parts.ts`. Ids come from the client: a site of another tenant
 * is a 404.
 *
 * Measurements aren't deleted with what they measure: a site with readings, door events or alerts
 * can't be deleted (their keys would cascade), and the refusal says so (`measured()`). There's no
 * archive: such a site stays, renamed.
 *
 * Every change is logged in its transaction, against the energy site (`siteSubject()`, also the
 * parent of its zones', consumers', doors', alerts' and thresholds' entries).
 */
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";

import { customerByCode } from "#lib/customers/server/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Runner, type Transaction } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentCategory } from "#lib/server/db/schema.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import type { EnergySiteInput, NewEnergySiteInput } from "../setup/setup-schema.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyDoorEvent,
	energyReading,
	energySite,
	energyZone,
} from "./schema.ts";

/** The energy site as the log names it, the parent of its parts' and alerts' entries. */
export const siteSubject = (site: { id: number; name: string }): Subject => ({
	type: "energy_site",
	id: site.id,
	label: site.name,
});

/** The `.leftJoin()` of each customer site's energy site, in the tenant. */
const energyOfSite = () =>
	[energySite, and(eq(energySite.siteId, customerSite.id), inTenant(energySite))] as const;

/** The customer's sites, each with its energy site (with how many zones and doors) if it has one. */
export async function customerEnergy(code: string) {
	const found = await customerByCode(code, {
		id: customer.id,
		code: customer.code,
		name: customer.name,
	});
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
			subject: siteSubject({ id: row.id, name: values.name }),
			after: values,
		});
		return { id: row.id };
	});
}

/** The tenant's energy site `id`, as stored, or a 404. */
export async function siteRow(id: number, runner: Runner = db) {
	return orNotFound(
		await runner.select().from(energySite).where(idInTenant(energySite, id)),
		m.energy_site_not_found(),
	);
}

/** Saves the energy site `id`'s settings, and logs what changed. */
export async function updateEnergySite(id: number, input: EnergySiteInput) {
	const after = siteLogged(input);
	await db.transaction(async (tx) => {
		const before = await siteRow(id, tx);
		await tx.update(energySite).set(after).where(idInTenant(energySite, id));
		await recordActivity(tx, {
			action: "updated",
			subject: siteSubject({ id, name: after.name }),
			before,
			after,
		});
	});
}

/** Which readings (by their zone), door events (by their door) and alerts `measured()` asks about. */
interface Measured {
	zone?: SQL;
	door: SQL;
	alert: SQL;
}

/**
 * Whether there are readings, door events or alerts `where` says. Asked in the deleting
 * transaction: transactions take turns, so no batch is stored between the answer and the delete.
 */
export async function measured(tx: Transaction, where: Measured) {
	const found = await Promise.all([
		where.zone &&
			tx
				.select({ zoneId: energyReading.zoneId })
				.from(energyReading)
				.innerJoin(...tenantJoin(energyZone, energyReading.zoneId))
				.where(and(inTenant(energyReading), where.zone))
				.limit(1),
		tx
			.select({ doorId: energyDoorEvent.doorId })
			.from(energyDoorEvent)
			.innerJoin(...tenantJoin(energyDoor, energyDoorEvent.doorId))
			.where(and(inTenant(energyDoorEvent), where.door))
			.limit(1),
		tx
			.select({ id: energyAlert.id })
			.from(energyAlert)
			.where(and(inTenant(energyAlert), where.alert))
			.limit(1),
	]);
	return found.some((rows) => rows && rows.length > 0);
}

/**
 * Deletes the energy site `id` with its zones, consumers, doors and thresholds, and logs it; refused
 * (the problem answered) while it has measurements or alerts.
 */
export async function deleteEnergySite(id: number) {
	const site = await siteRow(id);
	await db.transaction(async (tx) => {
		const of = {
			zone: eq(energyZone.energySiteId, id),
			door: eq(energyDoor.energySiteId, id),
			alert: eq(energyAlert.energySiteId, id),
		};
		if (await measured(tx, of)) throw new Refused(m.energy_setup_site_measured());
		await deleteAndLog(energySite, { tx, subject: siteSubject(site) });
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
		db
			.select({
				id: equipment.id,
				name: equipment.name,
				serialNumber: equipment.serialNumber,
				category: equipmentCategory.name,
			})
			.from(equipment)
			.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
			.where(and(inTenant(equipment), eq(equipment.siteId, site.siteId)))
			.orderBy(asc(equipment.name), asc(equipment.serialNumber)),
	]);
	return { site: { ...site, ...place[0] }, zones, consumers, doors, units };
}
