/**
 * The door-open rules (§2.4): a door open 40 minutes or more turns amber and the dock planner gets
 * a notice (an entry in the activity log on the dock, `door_alert`, which the board lists); an hour
 * or more turns it red, and a breakdown order is made on the dock's door through `createOrders()`,
 * at most one open such order per door (`dock_escalation`), logged as `door_escalated`. Each band
 * acts once per opening (`dock_state.door_alert`, cleared when the door closes). `checkDoors()`
 * runs after every batch the feed posts (an empty batch is a heartbeat that runs it) and in the
 * daily job; each dock in a transaction of its own, so one that fails doesn't keep the others'.
 */
import { and, eq, isNotNull } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { createOrders } from "#lib/orders/server/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment, order } from "#lib/server/db/schema.ts";

import { type DoorBand, doorAlertDue } from "../model.ts";
import { dockEscalation, dockPosition, dockState } from "./schema.ts";

/** What a check did: notices given (amber and red) and breakdown orders made. */
export interface DoorCheck {
	notices: number;
	orders: string[];
}

/** The tenant's open breakdown order on `doorId` that a dock's rules made, if there is one. */
async function openEscalation(tx: Transaction, doorId: number) {
	const [found] = await tx
		.select({ number: order.number })
		.from(dockEscalation)
		.innerJoin(...tenantJoin(order, dockEscalation.orderId))
		.where(
			and(
				inTenant(dockEscalation),
				eq(dockEscalation.equipmentId, doorId),
				inList(order.status, [...openOrderStatuses]),
			),
		)
		.limit(1);
	return found?.number;
}

/** Acts on one dock's door at `now`, if its band asks for it; answers what it did. */
async function checkDoor(dockId: number, now: Temporal.Instant): Promise<DoorCheck> {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const [found] = await tx
			.select({
				code: dockPosition.code,
				doorId: dockPosition.doorId,
				customer: { id: customer.id, code: customer.code },
				doorOpenSince: dockState.doorOpenSince,
				doorAlert: dockState.doorAlert,
				doorCustomerId: equipment.customerId,
			})
			.from(dockState)
			.innerJoin(...tenantJoin(dockPosition, dockState.dockId))
			.innerJoin(...tenantJoin(customerSite, dockPosition.siteId))
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.leftJoin(...tenantJoin(equipment, dockPosition.doorId))
			.where(and(inTenant(dockState), eq(dockState.dockId, dockId)));
		// Checked again in the transaction: another check may have acted meanwhile.
		const band: DoorBand | null = found ? doorAlertDue(found, now) : null;
		if (!found || !band) return { notices: 0, orders: [] };

		await tx
			.update(dockState)
			.set({ doorAlert: band, updatedAt: now })
			.where(and(inTenant(dockState), eq(dockState.dockId, dockId)));
		const subject = { type: "dock", id: dockId, label: found.code };
		const parent = customerSubject(found.customer);
		if (band === "amber") {
			await recordActivity(tx, { action: "door_alert", subject, parent });
			return { notices: 1, orders: [] };
		}

		let made: string | undefined;
		if (found.doorId && found.doorCustomerId && !(await openEscalation(tx, found.doorId))) {
			const [created] = await createOrders(tx, [
				{
					customerId: found.doorCustomerId,
					units: [found.doorId],
					type: "breakdown",
					priority: "high",
					description: m.docks_escalation_description({ dock: found.code }),
				},
			]);
			await tx.insert(dockEscalation).values({
				organizationId,
				dockId,
				equipmentId: found.doorId,
				orderId: created.id,
			});
			made = created.number;
		}
		await recordActivity(tx, {
			action: "door_escalated",
			subject,
			parent,
			note: made ? m.docks_escalation_note({ number: made }) : null,
		});
		return { notices: 1, orders: made ? [made] : [] };
	});
}

/** Applies the rules to the tenant's open doors at `now`. */
export async function checkDoors(now = Temporal.Now.instant()): Promise<DoorCheck> {
	const open = await db
		.select({
			dockId: dockState.dockId,
			doorOpenSince: dockState.doorOpenSince,
			doorAlert: dockState.doorAlert,
		})
		.from(dockState)
		.where(and(inTenant(dockState), isNotNull(dockState.doorOpenSince)));
	const total: DoorCheck = { notices: 0, orders: [] };
	for (const dock of open.filter((each) => doorAlertDue(each, now))) {
		try {
			const done = await checkDoor(dock.dockId, now);
			total.notices += done.notices;
			total.orders.push(...done.orders);
		} catch (error) {
			console.error(`The door rules failed for dock ${dock.dockId}:`, error);
		}
	}
	return total;
}
