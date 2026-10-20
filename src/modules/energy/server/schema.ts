import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	real,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
	createdAt,
	moment,
	optionalTenantColumns,
	optionalTenantRef,
	tenantRef,
	tenantTable,
} from "#lib/server/db/columns.ts";
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
export const energySite = tenantTable(
	"energy_site",
	{
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
		uniqueIndex("energy_site_site").on(table.organizationId, table.siteId),
		tenantRef(table, table.siteId, customerSite, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/** A part of the site with a meter of its own, e.g. `Z-R61` "Vul- en inpakafdeling" on the ground floor. */
export const energyZone = tenantTable(
	"energy_zone",
	{
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
		uniqueIndex("energy_zone_site_id").on(table.energySiteId, table.id),
		uniqueIndex("energy_zone_site_code").on(table.energySiteId, table.code),
		index("energy_zone_site").on(table.organizationId, table.energySiteId),
		tenantRef(table, table.energySiteId, energySite, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/** What uses the power in a zone, e.g. "CO₂-compressor 1" (24.6 kW), maybe one of the units. */
export const energyConsumer = tenantTable(
	"energy_consumer",
	{
		zoneId: integer("zone_id").notNull(),
		name: text("name").notNull(),
		ratedKw: real("rated_kw").notNull(),
		...optionalTenantColumns("equipment"),
		position: integer("position").notNull().default(0),
	},
	(table) => [
		index("energy_consumer_zone").on(table.organizationId, table.zoneId),
		...optionalTenantRef(table, "equipment", equipment),
		tenantRef(table, table.zoneId, energyZone, { onDelete: "cascade" }),
	],
);

/**
 * A door whose open time costs energy, e.g. `D-05` "Sectionaaldeur Dock 05" (11.4 kW lost while
 * open, an alert after 10 minutes) or a freezer's: in a zone, maybe one of the units.
 */
export const energyDoor = tenantTable(
	"energy_door",
	{
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
		...optionalTenantColumns("equipment"),
	},
	(table) => [
		uniqueIndex("energy_door_site_code").on(table.energySiteId, table.code),
		index("energy_door_site").on(table.organizationId, table.energySiteId),
		index("energy_door_zone").on(table.energySiteId, table.zoneId),
		...optionalTenantRef(table, "equipment", equipment),
		tenantRef(table, table.energySiteId, energySite, { onDelete: "cascade" }),
		// A zone of its own site.
		foreignKey({
			columns: [table.energySiteId, table.zoneId],
			foreignColumns: [energyZone.energySiteId, energyZone.id],
		}).onDelete("cascade"),
		check("energy_door_threshold", sql`${table.thresholdMinutes} > 0`),
	],
	{ referenced: true },
);

/**
 * A zone's meter over 15 minutes from `start`: average and peak power, and the energy. Aggregates
 * only (a gateway's raw telegrams stay out of the app's database, which on Cloudflare is one
 * Durable Object); one row per zone and interval, which a resent interval replaces.
 */
export const energyReading = tenantTable(
	"energy_reading",
	{
		zoneId: integer("zone_id").notNull(),
		start: moment("start").notNull(),
		avgKw: real("avg_kw").notNull(),
		peakKw: real("peak_kw").notNull(),
		kwh: real("kwh").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.zoneId, table.start] }),
		index("energy_reading_zone").on(table.organizationId, table.zoneId),
		tenantRef(table, table.zoneId, energyZone, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/** A door opening or closing, as its sensor reported it. */
export const energyDoorEvent = tenantTable(
	"energy_door_event",
	{
		doorId: integer("door_id").notNull(),
		at: moment("at").notNull(),
		open: integer("open", { mode: "boolean" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.doorId, table.at, table.open] }),
		index("energy_door_event_door").on(table.organizationId, table.doorId),
		tenantRef(table, table.doorId, energyDoor, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/** A zone's alert thresholds ("Energie-alerts per zone"): max power and consumption per day. */
export const energyThreshold = tenantTable(
	"energy_threshold",
	{
		zoneId: integer("zone_id").primaryKey(),
		enabled: integer("enabled", { mode: "boolean" }).notNull(),
		maxKw: real("max_kw").notNull(),
		/** Per day. */
		maxKwh: real("max_kwh").notNull(),
	},
	(table) => [
		index("energy_threshold_zone").on(table.organizationId, table.zoneId),
		tenantRef(table, table.zoneId, energyZone, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * A breach of a zone's thresholds, or a door open too long (`energie_meldingen`), raised by the
 * ingest: at most one per `key` (a zone's power per hour, its consumption per day, a door per
 * opening; `../model.ts`). Its recommendation follows
 * from what it's about and is shown in the reader's language. Made into an order, then dealt with.
 */
export const energyAlert = tenantTable(
	"energy_alert",
	{
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
		/** The order it was made into, with the alert's tenant while it has one. */
		...optionalTenantColumns("order"),
		doneAt: moment("done_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("energy_alert_key").on(table.organizationId, table.key),
		index("energy_alert_site").on(table.organizationId, table.energySiteId, table.status, table.at),
		index("energy_alert_zone").on(table.organizationId, table.zoneId),
		index("energy_alert_door").on(table.organizationId, table.doorId),
		...optionalTenantRef(table, "order", order),
		tenantRef(table, table.energySiteId, energySite, { onDelete: "cascade" }),
		tenantRef(table, table.zoneId, energyZone, { onDelete: "cascade" }),
		tenantRef(table, table.doorId, energyDoor, { onDelete: "cascade" }),
	],
	{ referenced: true },
);
