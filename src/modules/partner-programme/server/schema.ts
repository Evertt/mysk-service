import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, day, moment, organizationId } from "#lib/server/db/columns.ts";
import { customer, order, user } from "#lib/server/db/schema.ts";
import { creditNote } from "#modules/invoices/api/schema.server.ts";

import {
	bonusForms,
	bonusYearStatuses,
	type CategoryRule,
	eligibilities,
	revenueCategories,
	type Tier,
	walletEntryKinds,
} from "../model.ts";

// These tables reference the core's, never the other way round. Amounts in cents, rates in basis
// points (see `../model.ts`).

/**
 * A year of the tenant's programme: its levels, how each revenue category counts, and how long the
 * year's credit stays valid. A new year starts as a copy of the one before.
 */
export const programmeYear = sqliteTable(
	"partner_programme_year",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		year: integer("year").notNull(),
		tiers: text("tiers", { mode: "json" }).$type<Tier[]>().notNull(),
		categories: text("categories", { mode: "json" }).$type<CategoryRule[]>().notNull(),
		/** The year's credit is valid until 31 December this many years later. */
		creditValidYears: integer("credit_valid_years").notNull().default(1),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("partner_programme_year_organization_year").on(table.organizationId, table.year),
	],
);

/** A customer the tenant accepted into its programme: a partner. */
export const partnerAccount = sqliteTable(
	"partner_account",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		customerId: integer("customer_id").notNull(),
		acceptedOn: day("accepted_on").notNull(),
		/** Who accepted it; none once their account is gone. */
		acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("partner_account_organization_customer").on(table.organizationId, table.customerId),
		index("partner_account_accepted_by").on(table.acceptedBy),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}).onDelete("cascade"),
	],
);

/**
 * How an order's revenue counts for the programme, as the office classified it in the order form:
 * its category and its eligibility, each left out for the default (by the order's type, see
 * `defaultCategories`, and by the category's rule).
 */
export const orderClassification = sqliteTable(
	"partner_order_classification",
	{
		organizationId: organizationId(),
		orderId: integer("order_id").notNull(),
		category: text("category", { enum: revenueCategories }),
		eligibility: text("eligibility", { enum: eligibilities }),
		/** For `partial`: the percentage that counts. */
		share: integer("share"),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.orderId] }),
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}).onDelete("cascade"),
	],
);

/**
 * A partner's closed year: its figures as they were when the year was closed (frozen: later
 * payments or rules don't change them), its level and bonus in each form, and the partner's choice
 * between them, made once. A year that's still running has no row: its figures are computed.
 */
export const bonusYear = sqliteTable(
	"partner_bonus_year",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		customerId: integer("customer_id").notNull(),
		year: integer("year").notNull(),
		status: text("status", { enum: bonusYearStatuses }).notNull(),
		partnerRevenue: integer("partner_revenue").notNull(),
		bonusRevenueCash: integer("bonus_revenue_cash").notNull(),
		bonusRevenueCredit: integer("bonus_revenue_credit").notNull(),
		/** None below the first level. */
		level: text("level"),
		cashRate: integer("cash_rate"),
		creditRate: integer("credit_rate"),
		cashAmount: integer("cash_amount").notNull(),
		creditAmount: integer("credit_amount").notNull(),
		/** The last day the credit can be spent, if it's chosen. */
		creditValidUntil: day("credit_valid_until").notNull(),
		finalisedAt: moment("finalised_at").notNull(),
		/** Cash or credit, once chosen; never changed after. */
		choice: text("choice", { enum: bonusForms }),
		chosenAt: moment("chosen_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("partner_bonus_year_organization_id").on(table.organizationId, table.id),
		uniqueIndex("partner_bonus_year_customer_year").on(
			table.organizationId,
			table.customerId,
			table.year,
		),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
	],
);

/**
 * The credit note a partner's cash bonus for a closed year is paid out with: the invoicing module's,
 * standalone, made by the office once the partner chose cash (see `payBonusByCreditNote()` in
 * `./close.ts`). A year without one is paid outside the app, as before. One per year; a voided
 * credit note's row is pointed at the one that replaces it.
 */
export const bonusCreditNote = sqliteTable(
	"partner_bonus_credit_note",
	{
		organizationId: organizationId(),
		bonusYearId: integer("bonus_year_id").notNull(),
		creditNoteId: integer("credit_note_id").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.bonusYearId] }),
		uniqueIndex("partner_bonus_credit_note_credit_note").on(
			table.organizationId,
			table.creditNoteId,
		),
		foreignKey({
			columns: [table.organizationId, table.bonusYearId],
			foreignColumns: [bonusYear.organizationId, bonusYear.id],
		}),
		foreignKey({
			columns: [table.organizationId, table.creditNoteId],
			foreignColumns: [creditNote.organizationId, creditNote.id],
		}),
	],
);

/**
 * A partner's wallet, as a ledger: every change to its credit, signed (an award or a reversal adds,
 * a spend or an expiry takes). The balance is the sum, and never goes below zero: what goes out is
 * checked against what's available (see `walletSummary()`).
 */
export const walletEntry = sqliteTable(
	"partner_wallet_entry",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		customerId: integer("customer_id").notNull(),
		/** The closed year it comes from (an award, or the expiry of its credit). */
		bonusYearId: integer("bonus_year_id"),
		kind: text("kind", { enum: walletEntryKinds }).notNull(),
		amount: integer("amount").notNull(),
		/** For credit that comes in, and for an expiry the date the expired credit was valid until. */
		validUntil: day("valid_until"),
		/** What it's for, e.g. the parts it was spent on; stored in the language of whoever made it. */
		note: text("note"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("partner_wallet_entry_organization_id").on(table.organizationId, table.id),
		index("partner_wallet_entry_customer").on(table.organizationId, table.customerId),
		index("partner_wallet_entry_bonus_year").on(table.organizationId, table.bonusYearId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
		foreignKey({
			columns: [table.organizationId, table.bonusYearId],
			foreignColumns: [bonusYear.organizationId, bonusYear.id],
		}),
	],
);
