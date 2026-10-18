import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, moment, organizationId } from "#lib/server/db/columns.ts";
import { customerSite, equipment, order } from "#lib/server/db/schema.ts";

import {
	alertMetrics,
	alertSeverities,
	alertStatuses,
	DEFAULT_CO2_FACTOR,
	DEFAULT_TARIFF,
	doorKinds,
} from "../model.ts";

// These tables reference the core's, never the other way round. A unit a consumer or door is
// (`equipment_id`) has the record's tenant in a column of its own (`equipment_organization_id`),
// so that removing the unit clears the link only (`on delete set null` clears every column of a
// key, see `unit_condition`).

/**
 * A customer's site whose energy the tenant watches (`Energie · Gebouw`), e.g. Riedel's
 * "Productielocatie" in Ede: its main connection's contract, solar panels, tariff and CO₂ factor,
 * and the time zone its days are counted in. One per customer site.
 */
export const energySite = sqliteTable(
	"energy_site",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		siteId: integer("site_id").notNull(),
		/** E.g. "Riedel Ede — Productielocatie". */
		name: text("name").notNull(),
		/** The main connection's name, e.g. "Hoofdaansluiting". */
		meterName: text("meter_name").notNull(),
		contractedPeakKw: real("contracted_peak_kw").notNull(),
		contractedKwhPerYear: integer("contracted_kwh_per_year").notNull(),
		pvCapacityKw: real("pv_capacity_kw").notNull().default(0),
		/** €/kWh. */
		tariff: real("tariff").notNull().default(DEFAULT_TARIFF),
		/** kg CO₂/kWh. */
		co2Factor: real("co2_factor").notNull().default(DEFAULT_CO2_FACTOR),
		/** Where the site is: its days (today's consumption, the hours of a chart) are its own. */
		timeZone: text("time_zone").notNull().default("Europe/Amsterdam"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("energy_site_organization_id").on(table.organizationId, table.id),
		uniqueIndex("energy_site_site").on(table.organizationId, table.siteId),
		foreignKey({
			columns: [table.organizationId, table.siteId],
			foreignColumns: [customerSite.organizationId, customerSite.id],
		}).onDelete("cascade"),
	],
);

/** A part of the site with a meter of its own, e.g. `Z-R61` "Vul- en inpakafdeling" on the ground floor. */
export const energyZone = sqliteTable(
	"energy_zone",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		energySiteId: integer("energy_site_id").notNull(),
		/** Unique in the site; what the readings name the zone by. */
		code: text("code").notNull(),
		name: text("name").notNull(),
		/** E.g. "Begane grond"; none for a unit outside the building. */
		floor: text("floor"),
		areaM2: integer("area_m2").notNull().default(0),
		/** Its place in the site's lists. */
		position: integer("position").notNull().default(0),
	},
	(table) => [
		uniqueIndex("energy_zone_organization_id").on(table.organizationId, table.id),
		uniqueIndex("energy_zone_site_id").on(table.energySiteId, table.id),
		uniqueIndex("energy_zone_site_code").on(table.energySiteId, table.code),
		index("energy_zone_site").on(table.organizationId, table.energySiteId),
		foreignKey({
			columns: [table.organizationId, table.energySiteId],
			foreignColumns: [energySite.organizationId, energySite.id],
		}).onDelete("cascade"),
	],
);

/** What uses the power in a zone, e.g. "CO₂-compressor 1" (24.6 kW), maybe one of the units. */
export const energyConsumer = sqliteTable(
	"energy_consumer",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		zoneId: integer("zone_id").notNull(),
		name: text("name").notNull(),
		ratedKw: real("rated_kw").notNull(),
		equipmentId: integer("equipment_id"),
		equipmentOrganizationId: text("equipment_organization_id"),
		position: integer("position").notNull().default(0),
	},
	(table) => [
		index("energy_consumer_zone").on(table.organizationId, table.zoneId),
		index("energy_consumer_equipment").on(table.equipmentOrganizationId, table.equipmentId),
		foreignKey({
			columns: [table.organizationId, table.zoneId],
			foreignColumns: [energyZone.organizationId, energyZone.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.equipmentOrganizationId, table.equipmentId],
			foreignColumns: [equipment.organizationId, equipment.id],
		}).onDelete("set null"),
		check(
			"energy_consumer_equipment_tenant",
			sql`${table.equipmentOrganizationId} is null or ${table.equipmentOrganizationId} = ${table.organizationId}`,
		),
	],
);

/**
 * A door whose open time costs energy, e.g. `D-05` "Sectionaaldeur Dock 05" (11.4 kW lost while
 * open, an alert after 10 minutes) or a freezer's: in a zone, maybe one of the units.
 */
export const energyDoor = sqliteTable(
	"energy_door",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		energySiteId: integer("energy_site_id").notNull(),
		zoneId: integer("zone_id").notNull(),
		/** Unique in the site; what the door events name it by. */
		code: text("code").notNull(),
		name: text("name").notNull(),
		kind: text("kind", { enum: doorKinds }).notNull(),
		/** The power lost while it's open (heat out, or the extra cooling). */
		lossKw: real("loss_kw").notNull(),
		/** Open this long, it's over its threshold and raises an alert. */
		thresholdMinutes: integer("threshold_minutes").notNull(),
		insideC: real("inside_c"),
		outsideC: real("outside_c"),
		equipmentId: integer("equipment_id"),
		equipmentOrganizationId: text("equipment_organization_id"),
	},
	(table) => [
		uniqueIndex("energy_door_organization_id").on(table.organizationId, table.id),
		uniqueIndex("energy_door_site_code").on(table.energySiteId, table.code),
		index("energy_door_site").on(table.organizationId, table.energySiteId),
		index("energy_door_zone").on(table.energySiteId, table.zoneId),
		index("energy_door_equipment").on(table.equipmentOrganizationId, table.equipmentId),
		foreignKey({
			columns: [table.organizationId, table.energySiteId],
			foreignColumns: [energySite.organizationId, energySite.id],
		}).onDelete("cascade"),
		// A zone of its own site.
		foreignKey({
			columns: [table.energySiteId, table.zoneId],
			foreignColumns: [energyZone.energySiteId, energyZone.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.equipmentOrganizationId, table.equipmentId],
			foreignColumns: [equipment.organizationId, equipment.id],
		}).onDelete("set null"),
		check("energy_door_threshold", sql`${table.thresholdMinutes} > 0`),
		check(
			"energy_door_equipment_tenant",
			sql`${table.equipmentOrganizationId} is null or ${table.equipmentOrganizationId} = ${table.organizationId}`,
		),
	],
);

/**
 * A zone's meter over 15 minutes from `start`: average and peak power, and the energy. Aggregates
 * only (a gateway's raw telegrams stay out of the app's database, which on Cloudflare is one
 * Durable Object); one row per zone and interval, which a resent interval replaces.
 */
export const energyReading = sqliteTable(
	"energy_reading",
	{
		organizationId: organizationId(),
		zoneId: integer("zone_id").notNull(),
		start: moment("start").notNull(),
		avgKw: real("avg_kw").notNull(),
		peakKw: real("peak_kw").notNull(),
		kwh: real("kwh").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.zoneId, table.start] }),
		index("energy_reading_zone").on(table.organizationId, table.zoneId),
		foreignKey({
			columns: [table.organizationId, table.zoneId],
			foreignColumns: [energyZone.organizationId, energyZone.id],
		}).onDelete("cascade"),
	],
);

/** A door opening or closing, as its sensor reported it. */
export const energyDoorEvent = sqliteTable(
	"energy_door_event",
	{
		organizationId: organizationId(),
		doorId: integer("door_id").notNull(),
		at: moment("at").notNull(),
		open: integer("open", { mode: "boolean" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.doorId, table.at, table.open] }),
		index("energy_door_event_door").on(table.organizationId, table.doorId),
		foreignKey({
			columns: [table.organizationId, table.doorId],
			foreignColumns: [energyDoor.organizationId, energyDoor.id],
		}).onDelete("cascade"),
	],
);

/** A zone's alert thresholds ("Energie-alerts per zone"): max power and consumption per day. */
export const energyThreshold = sqliteTable(
	"energy_threshold",
	{
		zoneId: integer("zone_id").primaryKey(),
		organizationId: organizationId(),
		enabled: integer("enabled", { mode: "boolean" }).notNull(),
		maxKw: real("max_kw").notNull(),
		/** Per day. */
		maxKwh: real("max_kwh").notNull(),
	},
	(table) => [
		index("energy_threshold_zone").on(table.organizationId, table.zoneId),
		foreignKey({
			columns: [table.organizationId, table.zoneId],
			foreignColumns: [energyZone.organizationId, energyZone.id],
		}).onDelete("cascade"),
	],
);

/**
 * A breach of a zone's thresholds, or a door open too long (`energie_meldingen`), raised by the
 * ingest: at most one per `key` (a zone's power per hour, its consumption per day, a door per
 * opening; `../model.ts`). Its recommendation follows
 * from what it's about and is shown in the reader's language. Made into an order, then dealt with.
 */
export const energyAlert = sqliteTable(
	"energy_alert",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		energySiteId: integer("energy_site_id").notNull(),
		zoneId: integer("zone_id").notNull(),
		doorId: integer("door_id"),
		key: text("key").notNull(),
		metric: text("metric", { enum: alertMetrics }).notNull(),
		severity: text("severity", { enum: alertSeverities }).notNull(),
		/** In the metric's unit: kW, kWh or minutes open. */
		threshold: real("threshold").notNull(),
		measured: real("measured").notNull(),
		/** When it happened: the interval's start, or when the door opened. */
		at: moment("at").notNull(),
		status: text("status", { enum: alertStatuses }).notNull().default("open"),
		orderId: integer("order_id"),
		/** The alert's tenant while it has an order (see `unit_condition`). */
		orderOrganizationId: text("order_organization_id"),
		doneAt: moment("done_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("energy_alert_organization_id").on(table.organizationId, table.id),
		uniqueIndex("energy_alert_key").on(table.organizationId, table.key),
		index("energy_alert_site").on(table.organizationId, table.energySiteId, table.status, table.at),
		index("energy_alert_zone").on(table.organizationId, table.zoneId),
		index("energy_alert_door").on(table.organizationId, table.doorId),
		index("energy_alert_order").on(table.orderOrganizationId, table.orderId),
		foreignKey({
			columns: [table.organizationId, table.energySiteId],
			foreignColumns: [energySite.organizationId, energySite.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.zoneId],
			foreignColumns: [energyZone.organizationId, energyZone.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.doorId],
			foreignColumns: [energyDoor.organizationId, energyDoor.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.orderOrganizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("set null"),
		check(
			"energy_alert_order_tenant",
			sql`${table.orderOrganizationId} is null or ${table.orderOrganizationId} = ${table.organizationId}`,
		),
	],
);
