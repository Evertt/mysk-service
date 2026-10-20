import { relations } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, day, tenantOne, tenantRef, tenantTable } from "#lib/server/db/columns.ts";
import { customer, equipment } from "#lib/server/db/schema.ts";

import { contractLevels } from "../model.ts";

// These tables reference the core tables, never the other way round.

/**
 * A maintenance agreement: for a monthly fee, the customer's covered equipment gets service with
 * a guaranteed response time. Its status (upcoming, active, expired) follows from the period,
 * see `contractStatus` in `../model.ts`.
 */
export const contract = tenantTable(
	"contract",
	{
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		level: text("level", { enum: contractLevels }).notNull(),
		/** The first day of the contract, at local midnight. */
		startsOn: day("starts_on").notNull(),
		/** The last day of the contract (inclusive), at local midnight. */
		endsOn: day("ends_on").notNull(),
		/** In cents. */
		monthlyFee: integer("monthly_fee").notNull(),
		/** The promised response time for a call-out. */
		responseHours: integer("response_hours").notNull(),
		notes: text("notes"),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("contract_organization_number").on(table.organizationId, table.number),
		// For coverage, which must be of the contract's customer's equipment.
		uniqueIndex("contract_customer_id").on(table.customerId, table.id),
		index("contract_customer").on(table.organizationId, table.customerId),
		tenantRef(table, table.customerId, customer),
	],
);

/**
 * The equipment a contract covers: only the contract's customer's, which the foreign keys on
 * `customer_id` enforce. So a covered unit can't move to another customer. Removing a unit or the
 * contract removes its coverage, so deleting equipment doesn't need to know about contracts.
 */
export const contractEquipment = sqliteTable(
	"contract_equipment",
	{
		customerId: integer("customer_id").notNull(),
		contractId: integer("contract_id").notNull(),
		equipmentId: integer("equipment_id").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.contractId, table.equipmentId] }),
		index("contract_equipment_contract").on(table.customerId, table.contractId),
		index("contract_equipment_equipment").on(table.customerId, table.equipmentId),
		foreignKey({
			columns: [table.customerId, table.contractId],
			foreignColumns: [contract.customerId, contract.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customerId, table.equipmentId],
			foreignColumns: [equipment.customerId, equipment.id],
		}).onDelete("cascade"),
	],
);

export const contractRelations = relations(contract, ({ one, many }) => ({
	customer: tenantOne(one, contract.customerId, customer),
	coverage: many(contractEquipment),
}));

export const contractEquipmentRelations = relations(contractEquipment, ({ one }) => ({
	contract: one(contract, {
		fields: [contractEquipment.customerId, contractEquipment.contractId],
		references: [contract.customerId, contract.id],
	}),
	equipment: one(equipment, {
		fields: [contractEquipment.customerId, contractEquipment.equipmentId],
		references: [equipment.customerId, equipment.id],
	}),
}));
