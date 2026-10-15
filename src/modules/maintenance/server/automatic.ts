/**
 * Automatic orders: the module's daily job (`jobs.daily`, see `index.ts`). For a tenant that has
 * them on (its settings), the daily run turns the plans that are due within the tenant's lead time
 * into orders, through `orderPlan()` like "Create orders" does, so they're numbered, checked and
 * logged alike (as the system's: no one is signed in, see `asSystem()`). Safe to run again: a plan
 * gets no second order while its last one is open (`dueForAutomaticOrder()`). With reminders on,
 * each order's customer gets an email afterwards, outside the transactions.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";

import type { DailyReport, DailyRun } from "#lib/jobs/extensions.ts";
import { currentTenant, idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, order } from "#lib/server/db/schema.ts";
import { sendMail } from "#lib/server/mail/index.ts";

import { automaticHorizon, finishedStatuses } from "../model.ts";
import { orderPlan, type PlanOrder } from "./orders.ts";
import { maintenanceSettings, maintenancePlan } from "./schema.ts";
import { settingsOf } from "./settings.ts";

/**
 * The ids of the tenant's plans the daily run makes orders for before `horizon`, the earliest due
 * first: what `dueForAutomaticOrder()` says, in SQL. `orderPlan()` checks each again in its
 * transaction.
 */
function plansDueBefore(horizon: Temporal.PlainDate) {
	return db
		.select({ id: maintenancePlan.id })
		.from(maintenancePlan)
		.leftJoin(...tenantJoin(order, maintenancePlan.lastOrderId))
		.where(
			and(
				inTenant(maintenancePlan),
				eq(maintenancePlan.paused, false),
				lt(maintenancePlan.nextDueOn, horizon),
				or(isNull(order.id), inList(order.status, [...finishedStatuses])),
			),
		)
		.orderBy(maintenancePlan.nextDueOn, maintenancePlan.id);
}

/**
 * The tenant's daily maintenance job: makes the orders of the plans that are due, if the tenant
 * wants that, and tells their customers if it wants that too. Each plan in a transaction of its
 * own: one that fails (say, its unit moved to another customer meanwhile) is logged and the others
 * go ahead. Reports how many orders it made (and how many plans failed, if any).
 */
export async function runDueMaintenance({ today }: DailyRun): Promise<DailyReport> {
	const { organizationId } = currentTenant();
	const settings = await settingsOf(organizationId);
	if (!settings.autoCreate) return {};

	const horizon = automaticHorizon(today, settings.leadDays);
	const made: PlanOrder[] = [];
	let failed = 0;
	for (const { id } of await plansDueBefore(horizon)) {
		try {
			const created = await orderPlan(id, { horizon });
			if (created) made.push(created);
		} catch (error) {
			failed++;
			console.error(`Maintenance plan ${id} got no automatic order:`, error);
		}
	}
	await db
		.update(maintenanceSettings)
		.set({ lastRunAt: Temporal.Now.instant(), lastRunOrders: made.length })
		.where(eq(maintenanceSettings.organizationId, organizationId));
	if (settings.remindCustomers) await remindCustomers(made);
	return { "maintenance.orders": made.length, ...(failed ? { "maintenance.failed": failed } : {}) };
}

/**
 * Emails each order's customer that a visit is coming for their unit. After the orders are made,
 * outside their transactions (mail mustn't hold the database), one at a time; a mail that fails is
 * logged. In the run's language (the cron's request has no user's).
 */
async function remindCustomers(orders: PlanOrder[]) {
	if (!orders.length) return;
	const { name: organization } = currentTenant();
	const customerIds = [...new Set(orders.map((made) => made.unit.customerId))];
	const customers = await db
		.select({ id: customer.id, contactName: customer.contactName, email: customer.email })
		.from(customer)
		.where(idsInTenant(customer, customerIds));
	const byId = new Map(customers.map((row) => [row.id, row]));
	for (const made of orders) {
		const to = byId.get(made.unit.customerId);
		if (!to?.email) continue;
		const facts = {
			organization,
			contact: to.contactName,
			description: made.description,
			serial: made.unit.serialNumber,
			number: made.number,
		};
		try {
			await sendMail({
				to: to.email,
				subject: m.maintenance_reminder_mail_subject(facts),
				text: [
					m.maintenance_reminder_mail_greeting(facts),
					"",
					m.maintenance_reminder_mail_body(facts),
					"",
					m.maintenance_reminder_mail_reference(facts),
				].join("\n"),
			});
		} catch (error) {
			console.error(`The maintenance reminder for order ${made.number} wasn't sent:`, error);
		}
	}
}
