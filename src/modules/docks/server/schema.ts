import { sql } from "drizzle-orm";
import { index, integer, primaryKey, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import {
	createdAt,
	moment,
	momentMs,
	optionalTenantColumns,
	optionalTenantRef,
	tenantRef,
	tenantTable,
} from "#lib/server/db/columns.ts";
import { customerSite, equipment, equipmentLocation, order } from "#lib/server/db/schema.ts";

import { dockEventTypes, doorBands, eventOutcomes, keyLocations } from "../model.ts";

// These tables reference the core's, never the other way round. See `../model.ts` for the rules.

/**
 * A dock position at a customer's site ("DOCK 05", "P-05 · Expeditie noord"): its door and its
 * leveller (units of the site), and its Salvo parts, if it has them: the SCP panel, the key and the
 * key storage unit it's kept in. The code is what the Salvo feed names the dock by, unique in the
 * tenant. A unit or location that's deleted leaves the dock without it: SQLite's `set null` clears
 * every column of a key, and `organization_id` can't be null, so each of those keys has a tenant
 * column of its own, which the checks hold to the dock's (as maintenance plans' last order).
 */
export const dockPosition = tenantTable(
	"dock_position",
	{
		siteId: integer("site_id").notNull(),
		/** E.g. `DOCK 05`, as Salvo names it. */
		code: text("code").notNull(),
		/** E.g. `P-05 · Expeditie noord`. */
		position: text("position").notNull().default(""),
		...optionalTenantColumns("location"),
		/** The sectional door: a breakdown order goes on it when it's left open too long. */
		...optionalTenantColumns("door"),
		...optionalTenantColumns("leveller"),
		/** The Salvo Control Panel, e.g. `SCP-05`; none for a dock without Salvo. */
		scpCode: text("scp_code"),
		/** The dock's Salvo key, e.g. `SLV-K05`. */
		keyId: text("key_id"),
		/** The key storage unit its key goes to, e.g. `KS-NOORD-1`. */
		keyStorageUnit: text("key_storage_unit"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("dock_position_organization_code").on(table.organizationId, table.code),
		index("dock_position_site").on(table.organizationId, table.siteId),
		tenantRef(table, table.siteId, customerSite, { onDelete: "cascade" }),
		...optionalTenantRef(table, "location", equipmentLocation),
		// A unit's docks; with their tenant columns, also the keys to the units.
		...optionalTenantRef(table, "door", equipment, { idFirst: true }),
		...optionalTenantRef(table, "leveller", equipment, { idFirst: true }),
	],
	{ referenced: true },
);

/**
 * A dock's live state, as the Salvo events leave it (`applyEvent()`): one row per dock, made with
 * its first event. Its state (Vrij, Bezet, Laden, Storing) and beacon follow from these and from
 * whether a session is open (`dockState()`, `beaconOf()`).
 */
export const dockState = tenantTable(
	"dock_state",
	{
		dockId: integer("dock_id").notNull(),
		locked: integer("locked", { mode: "boolean" }).notNull().default(false),
		doorOpenSince: moment("door_open_since"),
		scpOnline: integer("scp_online", { mode: "boolean" }).notNull().default(true),
		faultReason: text("fault_reason"),
		keyLocation: text("key_location", { enum: keyLocations }).notNull().default("scp"),
		/** The band of the open door the rules acted on (notice, escalation); cleared when it closes. */
		doorAlert: text("door_alert", { enum: doorBands }),
		/** To the millisecond: an event older than this one, also in the same second, is stale. */
		lastEventAt: momentMs("last_event_at"),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.dockId] }),
		tenantRef(table, table.dockId, dockPosition, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * A truck's visit to a dock: check-in (with carrier, plate, the load's reference and the planned
 * slot), locked, door opened and closed, check-out. A dock has at most one open session (not
 * checked out). The door-open time adds up over the visit (`doorOpenSeconds`).
 */
export const dockSession = tenantTable(
	"dock_session",
	{
		dockId: integer("dock_id").notNull(),
		carrier: text("carrier"),
		plate: text("plate"),
		reference: text("reference"),
		slotStart: moment("slot_start"),
		slotEnd: moment("slot_end"),
		checkedInAt: moment("checked_in_at").notNull(),
		lockedAt: moment("locked_at"),
		doorOpenedAt: moment("door_opened_at"),
		doorClosedAt: moment("door_closed_at"),
		unlockedAt: moment("unlocked_at"),
		checkedOutAt: moment("checked_out_at"),
		doorOpenSeconds: integer("door_open_seconds").notNull().default(0),
	},
	(table) => [
		index("dock_session_dock").on(table.organizationId, table.dockId, table.checkedInAt),
		uniqueIndex("dock_session_open")
			.on(table.dockId)
			.where(sql`${table.checkedOutAt} is null`),
		tenantRef(table, table.dockId, dockPosition, { onDelete: "cascade" }),
	],
	{ referenced: true },
);

/**
 * An event the Salvo feed sent, by its id (unique in the tenant): a second one with the same id is
 * a duplicate and does nothing. Kept for a while (the daily job prunes old ones), with what came of
 * it: applied, or stale (older than what the dock had applied).
 */
export const dockEvent = tenantTable(
	"dock_event",
	{
		eventId: text("event_id").notNull(),
		dockId: integer("dock_id").notNull(),
		type: text("type", { enum: dockEventTypes }).notNull(),
		at: moment("at").notNull(),
		payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
		outcome: text("outcome", { enum: eventOutcomes }).notNull(),
		receivedAt: moment("received_at")
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.eventId] }),
		index("dock_event_received").on(table.organizationId, table.receivedAt),
		index("dock_event_dock").on(table.organizationId, table.dockId),
		tenantRef(table, table.dockId, dockPosition, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

/**
 * A breakdown order the rules made because a dock's door stayed open an hour or more: so a door
 * gets at most one such order while it's open (not completed, invoiced or cancelled). Deleting the
 * order deletes this, and the next hour-long opening makes a new one.
 */
export const dockEscalation = tenantTable(
	"dock_escalation",
	{
		dockId: integer("dock_id").notNull(),
		/** The door the order is on. */
		equipmentId: integer("equipment_id").notNull(),
		orderId: integer("order_id").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("dock_escalation_door").on(table.organizationId, table.equipmentId),
		index("dock_escalation_dock").on(table.organizationId, table.dockId),
		index("dock_escalation_order").on(table.organizationId, table.orderId),
		tenantRef(table, table.dockId, dockPosition, { onDelete: "cascade" }),
		tenantRef(table, table.orderId, order, { onDelete: "cascade" }),
	],
);
