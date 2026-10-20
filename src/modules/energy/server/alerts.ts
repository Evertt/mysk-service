/**
 * A site's alerts and what's done with them: listed with what they're about, made into an order
 * (the mockup's "Focus AI batch": a repair of the door's unit when the door is one, else a survey
 * at the site's customer, through the core's `createOrders()`), and resolved ("Afhandelen").
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import { createOrders, type OrderDraft } from "#lib/orders/server/index.ts";
import { recordActivity, type LoggedSubjects } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { withTenantRefs } from "#lib/server/db/columns.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customerSite, order } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { alertDetail, recommendation } from "../display.ts";
import type { AlertStatus } from "../model.ts";
import { energyAlert, energyDoor, energySite, energyZone } from "./schema.ts";

/** How many alerts a list shows at most: the newest. */
const LIMIT = 200;

/** The current tenant's alerts that `where` keeps, with what they're about. */
function alertsWhere(where: SQL | undefined) {
	return db
		.select({
			id: energyAlert.id,
			siteId: energyAlert.energySiteId,
			siteName: energySite.name,
			customerId: customerSite.customerId,
			metric: energyAlert.metric,
			severity: energyAlert.severity,
			threshold: energyAlert.threshold,
			measured: energyAlert.measured,
			at: energyAlert.at,
			status: energyAlert.status,
			doneAt: energyAlert.doneAt,
			zoneCode: energyZone.code,
			zoneName: energyZone.name,
			doorCode: energyDoor.code,
			doorName: energyDoor.name,
			doorKind: energyDoor.kind,
			lossKw: energyDoor.lossKw,
			doorUnitId: energyDoor.equipmentId,
			orderNumber: order.number,
		})
		.from(energyAlert)
		.innerJoin(...tenantJoin(energySite, energyAlert.energySiteId))
		.innerJoin(...tenantJoin(customerSite, energySite.siteId))
		.innerJoin(...tenantJoin(energyZone, energyAlert.zoneId))
		.leftJoin(...tenantJoin(energyDoor, energyAlert.doorId))
		.leftJoin(...tenantJoin(order, energyAlert.orderId))
		.where(and(inTenant(energyAlert), where))
		.orderBy(desc(energyAlert.at), desc(energyAlert.id))
		.limit(LIMIT)
		.then((rows) =>
			rows.map(({ doorCode, doorName, doorKind, lossKw, doorUnitId, ...alert }) => ({
				...alert,
				door:
					doorCode !== null && doorName !== null && doorKind !== null && lossKw !== null
						? { code: doorCode, name: doorName, kind: doorKind, lossKw, unitId: doorUnitId }
						: null,
			})),
		);
}

/** The current tenant's alerts of site `siteId`, newest first, those of `status` (or all). */
export const siteAlerts = (siteId: number, status: AlertStatus | null) =>
	alertsWhere(
		and(eq(energyAlert.energySiteId, siteId), status ? eq(energyAlert.status, status) : undefined),
	);

type SiteAlert = Awaited<ReturnType<typeof siteAlerts>>[number];

/** The current tenant's alert `id`, or a 404. */
async function loadAlert(id: number) {
	return orNotFound(await alertsWhere(eq(energyAlert.id, id)), m.energy_alert_not_found());
}

const logged = (alert: SiteAlert): LoggedSubjects => ({
	subject: { type: "energy_alert", id: alert.id, label: alert.door?.code ?? alert.zoneCode },
	parent: { type: "energy_site", id: alert.siteId, label: alert.siteName },
});

/**
 * Makes an order of open alert `id` (see above): its description the recommendation and what was
 * measured, its priority high for an alert over its threshold. Links it and logs it. Answers the
 * order's number.
 */
export async function orderAlert(id: number) {
	const alert = await loadAlert(id);
	if (alert.status !== "open") error(409, m.energy_alert_not_open());
	const unitId = alert.door?.unitId ?? null;
	const draft: OrderDraft = {
		customerId: alert.customerId,
		units: unitId ? [unitId] : [],
		type: unitId ? "repair" : "survey",
		priority: alert.severity === "active" ? "high" : "normal",
		description: `${recommendation(alert)} (${alertDetail(alert)})`,
	};
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		// Still open, checked in the transaction before the order is made: a double click's second,
		// or an alert resolved since it was loaded, makes none.
		if (!(await claim(tx, id, eq(energyAlert.status, "open"), { status: "order" }))) {
			error(409, m.energy_alert_not_open());
		}
		const [created] = await createOrders(tx, [draft]);
		await tx
			.update(energyAlert)
			.set(withTenantRefs(organizationId, { orderId: created.id }))
			.where(idInTenant(energyAlert, id));
		await recordActivity(tx, { action: "alert_ordered", ...logged(alert), note: created.number });
		return created.number;
	});
}

/** Resolves alert `id`, open or made into an order; a 409 if it's resolved already. */
export async function resolveAlert(id: number) {
	const alert = await loadAlert(id);
	if (alert.status === "done") error(409, m.energy_alert_done_already());
	await db.transaction(async (tx) => {
		const done = { status: "done" as const, doneAt: Temporal.Now.instant() };
		if (!(await claim(tx, id, ne(energyAlert.status, "done"), done))) {
			error(409, m.energy_alert_done_already());
		}
		await recordActivity(tx, { action: "alert_resolved", ...logged(alert) });
	});
}

/**
 * Sets alert `id` to `changes` in `tx` if its status is still as `expected` (as it was loaded,
 * which another request may have changed since). Answers whether it was.
 */
async function claim(
	tx: Transaction,
	id: number,
	expected: SQL,
	changes: Partial<typeof energyAlert.$inferInsert>,
) {
	const claimed = await tx
		.update(energyAlert)
		.set(changes)
		.where(and(idInTenant(energyAlert, id), expected))
		.returning({ id: energyAlert.id });
	return claimed.length > 0;
}
