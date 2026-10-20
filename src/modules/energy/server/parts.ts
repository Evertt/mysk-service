/**
 * An energy site's zones, consumers and monitored doors, set up in the office (managers,
 * `../setup/`; the site itself is `./sites.ts`). Zone and door codes are unique in their site, as
 * the gateway names them by them (`../ingest/format.ts`); a consumer's or a door's unit is one of
 * the site's. Ids come from the client: a part of another site is a 404, a zone or unit that isn't
 * the site's a problem on its field.
 *
 * A zone with readings or alerts (or doors with events) and a door with events or alerts can't be
 * deleted (`measured()`). A zone's thresholds aren't set here: a new zone has none until a manager
 * sets them on the thresholds page, or its first day of readings gives it §2.5's defaults
 * (`thresholds.ts`). Each change is logged against the site.
 */
import { and, eq, ne, type SQL } from "drizzle-orm";
import type { SQLiteInsertValue, SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { deleteAndLog, nextPosition, orNotFound } from "#lib/server/records.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";

import type { ConsumerInput, DoorInput, ZoneInput } from "../setup/setup-schema.ts";
import { energyAlert, energyConsumer, energyDoor, energyZone } from "./schema.ts";
import { measured, siteRow, siteSubject } from "./sites.ts";

type Site = Awaited<ReturnType<typeof siteRow>>;
type Part = typeof energyZone | typeof energyConsumer | typeof energyDoor;

/** The zone `zoneId` of the energy site `siteId`, if it's one of its. */
async function zoneOf(siteId: number, zoneId: number) {
	const [found] = await db
		.select()
		.from(energyZone)
		.where(and(idInTenant(energyZone, zoneId), eq(energyZone.energySiteId, siteId)));
	return found;
}

/** The consumer `consumerId` of the energy site `siteId` (in one of its zones), with its zone's code. */
async function consumerOf(siteId: number, consumerId: number) {
	const [found] = await db
		.select({ consumer: energyConsumer, zone: energyZone.code })
		.from(energyConsumer)
		.innerJoin(...tenantJoin(energyZone, energyConsumer.zoneId))
		.where(and(idInTenant(energyConsumer, consumerId), eq(energyZone.energySiteId, siteId)));
	return found && { ...found.consumer, zone: found.zone };
}

/** The door `doorId` of the energy site `siteId`, with its zone's code. */
async function doorOf(siteId: number, doorId: number) {
	const [found] = await db
		.select({ door: energyDoor, zone: energyZone.code })
		.from(energyDoor)
		.innerJoin(...tenantJoin(energyZone, energyDoor.zoneId))
		.where(and(idInTenant(energyDoor, doorId), eq(energyDoor.energySiteId, siteId)));
	return found && { ...found.door, zone: found.zone };
}

/** The site's part `id` that `find` finds, or a 404; none without an id (a new one). */
async function existing<T>(id: number | null, find: (id: number) => Promise<T>, notFound: string) {
	return id ? orNotFound(await find(id), notFound) : undefined;
}

/** The problem with `code` if another of the site's zones (or doors) than `except` has it. */
async function codeTaken(
	table: typeof energyZone | typeof energyDoor,
	siteId: number,
	{ code, except }: { code: string; except: number | null },
	message: string,
): Promise<Problem[]> {
	const [taken] = await db
		.select({ id: table.id })
		.from(table)
		.where(
			and(
				inTenant(table),
				eq(table.energySiteId, siteId),
				eq(table.code, code),
				except ? ne(table.id, except) : undefined,
			),
		);
	return taken ? [{ path: ["code"], message }] : [];
}

/**
 * The site's zone `zoneId` that a consumer or door goes in; refuses it with `others` (problems of
 * its own) if the zone, or the unit `equipmentId`, isn't the site's.
 */
async function placeOf(
	site: Site,
	{ zoneId, equipmentId }: { zoneId: number; equipmentId: number | null },
	others: Promise<Problem[]> = Promise.resolve([]),
) {
	const [zone, units, problems] = await Promise.all([
		zoneOf(site.id, zoneId),
		equipmentId
			? db
					.select({ id: equipment.id })
					.from(equipment)
					.where(and(idInTenant(equipment, equipmentId), eq(equipment.siteId, site.siteId)))
			: [true],
		others,
	]);
	const unitProblems = units.length
		? []
		: [{ path: ["equipmentId"], message: m.energy_setup_unit_elsewhere() }];
	if (!zone) {
		const elsewhere = { path: ["zoneId"], message: m.energy_setup_zone_elsewhere() };
		throw new Refused(elsewhere, ...unitProblems, ...problems);
	}
	Refused.check([...unitProblems, ...problems]);
	return { zone, unit: withTenantRefs(currentTenant().organizationId, { equipmentId }) };
}

/**
 * Adds a part to the site (none `before`) or saves the one `before` was, and logs it against the
 * site: `values` are its columns, `logged` what the log compares. A new zone or consumer comes last
 * among those in `ordered` (its site's zones, its zone's consumers).
 */
async function upsertPart<T extends Part>(
	table: T,
	{
		site,
		subject,
		before,
		values,
		logged,
		ordered,
	}: {
		site: Site;
		subject: Omit<Subject, "id">;
		before: { id: number } | undefined;
		values: Partial<T["$inferInsert"]>;
		logged: Record<string, unknown>;
		ordered?: SQL;
	},
) {
	await db.transaction(async (tx) => {
		const logs = (id: number) => ({ subject: { ...subject, id }, parent: siteSubject(site) });
		if (before) {
			await tx
				.update(table)
				.set(values as SQLiteUpdateSetSource<T>)
				.where(idInTenant(table, before.id));
			await recordActivity(tx, { action: "updated", ...logs(before.id), before, after: logged });
			return;
		}
		// Doors have no place of their own: they're listed by code.
		const position = ordered && {
			position: await nextPosition(tx, table as typeof energyZone, ordered),
		};
		const { organizationId } = currentTenant();
		const [row] = await tx
			.insert(table)
			.values({ organizationId, ...position, ...values } as SQLiteInsertValue<T>)
			.returning({ id: table.id });
		await recordActivity(tx, { action: "created", ...logs(row.id), after: logged });
	});
}

/**
 * Adds a zone to the energy site `siteId` (with `input.zoneId`, saves that zone of it), and logs it.
 * Refuses a code the site has already. A new zone comes last, without thresholds.
 */
export async function saveZone(siteId: number, input: ZoneInput) {
	const site = await siteRow(siteId);
	const before = await existing(
		input.zoneId,
		(id) => zoneOf(site.id, id),
		m.energy_zone_not_found(),
	);
	const taken = { code: input.code, except: input.zoneId };
	Refused.check(await codeTaken(energyZone, site.id, taken, m.energy_setup_zone_code_taken()));
	const values = { code: input.code, name: input.name, floor: input.floor, areaM2: input.areaM2 };
	await upsertPart(energyZone, {
		site,
		subject: { type: "energy_zone", label: input.code },
		before,
		values: { energySiteId: site.id, ...values },
		logged: values,
		ordered: eq(energyZone.energySiteId, site.id),
	});
}

/**
 * Adds a consumer to a zone of the energy site `siteId` (with `input.consumerId`, saves that one),
 * and logs it. Refuses a zone or a unit that isn't the site's.
 */
export async function saveConsumer(siteId: number, input: ConsumerInput) {
	const site = await siteRow(siteId);
	const before = await existing(
		input.consumerId,
		(id) => consumerOf(site.id, id),
		m.energy_setup_consumer_not_found(),
	);
	const { zone, unit } = await placeOf(site, input);
	const fields = { name: input.name, ratedKw: input.ratedKw };
	await upsertPart(energyConsumer, {
		site,
		subject: { type: "energy_consumer", label: input.name },
		before,
		values: { zoneId: zone.id, ...fields, ...unit },
		logged: { zone: zone.code, ...fields, equipmentId: input.equipmentId },
		ordered: eq(energyConsumer.zoneId, zone.id),
	});
}

/**
 * Adds a monitored door to a zone of the energy site `siteId` (with `input.doorId`, saves that one),
 * and logs it. Refuses a zone or a unit that isn't the site's, or a code another of its doors has.
 */
export async function saveDoor(siteId: number, input: DoorInput) {
	const site = await siteRow(siteId);
	const before = await existing(
		input.doorId,
		(id) => doorOf(site.id, id),
		m.energy_setup_door_not_found(),
	);
	const taken = { code: input.code, except: input.doorId };
	const { zone, unit } = await placeOf(
		site,
		input,
		codeTaken(energyDoor, site.id, taken, m.energy_setup_door_code_taken()),
	);
	const fields = {
		code: input.code,
		name: input.name,
		kind: input.kind,
		lossKw: input.lossKw,
		thresholdMinutes: input.thresholdMinutes,
		insideC: input.insideC ?? null,
		outsideC: input.outsideC ?? null,
	};
	await upsertPart(energyDoor, {
		site,
		subject: { type: "energy_door", label: input.code },
		before,
		values: { energySiteId: site.id, zoneId: zone.id, ...fields, ...unit },
		logged: { zone: zone.code, ...fields, equipmentId: input.equipmentId },
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
		const of = {
			zone: eq(energyZone.id, zone.id),
			door: eq(energyDoor.zoneId, zone.id),
			alert: eq(energyAlert.zoneId, zone.id),
		};
		if (await measured(tx, of)) throw new Refused(m.energy_setup_zone_measured());
		await deleteAndLog(energyZone, {
			tx,
			subject: { type: "energy_zone", id: zone.id, label: zone.code },
			parent: siteSubject(site),
		});
	});
}

/** Deletes the consumer `consumerId` of the energy site `siteId`, and logs it. */
export async function deleteConsumer(siteId: number, consumerId: number) {
	const site = await siteRow(siteId);
	const consumer = orNotFound(
		await consumerOf(site.id, consumerId),
		m.energy_setup_consumer_not_found(),
	);
	await deleteAndLog(energyConsumer, {
		subject: { type: "energy_consumer", id: consumer.id, label: consumer.name },
		parent: siteSubject(site),
	});
}

/**
 * Deletes the door `doorId` of the energy site `siteId`, and logs it; refused while it has events or
 * alerts.
 */
export async function deleteDoor(siteId: number, doorId: number) {
	const site = await siteRow(siteId);
	const door = orNotFound(await doorOf(site.id, doorId), m.energy_setup_door_not_found());
	await db.transaction(async (tx) => {
		const of = { door: eq(energyDoor.id, door.id), alert: eq(energyAlert.doorId, door.id) };
		if (await measured(tx, of)) throw new Refused(m.energy_setup_door_measured());
		await deleteAndLog(energyDoor, {
			tx,
			subject: { type: "energy_door", id: door.id, label: door.code },
			parent: siteSubject(site),
		});
	});
}
