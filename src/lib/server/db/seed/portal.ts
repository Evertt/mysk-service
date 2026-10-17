/**
 * The demo customers' contacts in the customer portal (`customerIn` in `../demo.ts`): each linked
 * to their customer (all of its sites), with breakdowns they reported there: some awaiting
 * acceptance, and for SHLTR's Riedel one a planner accepted and one they rejected, so the office's
 * badge and the portal's statuses have something to show. Made after everything else, so the rest
 * of the demo data stays as it was.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import type { Transaction } from "#lib/server/db/index.ts";

import * as schema from "../schema.ts";
import { addDays, now } from "./clock.ts";
import { toMoment } from "./temporal.ts";

const { activity, customer, equipment, order, orderRequest, orderUnit, portalContact } = schema;

/** A demo contact's customer: by its name, or the organization's first customer. */
export interface DemoCustomerLink {
	organizationId: string;
	customer?: string;
	/** Their reports: what broke, how urgent, how long ago, and what the planner decided. */
	reports?: readonly DemoReport[];
}

interface DemoReport {
	description: string;
	priority: "normal" | "high" | "urgent";
	hoursAgo: number;
	decision?: { accepted: true } | { rejectionReason: string };
}

/** The office member who decides on the reports: the organization's first non-customer member. */
async function planner(tx: Transaction, organizationId: string) {
	const [found] = await tx
		.select({ id: schema.user.id, name: schema.user.name, role: schema.member.role })
		.from(schema.member)
		.innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
		.where(
			and(
				eq(schema.member.organizationId, organizationId),
				sql`${schema.member.role} in ('member', 'owner', 'admin')`,
			),
		)
		.orderBy(sql`${schema.member.role} = 'member' desc`, asc(schema.member.createdAt));
	return found;
}

/** Links a demo contact to their customer, and enters the breakdowns they reported. */
export async function linkDemoCustomer(
	tx: Transaction,
	contact: { id: string; name: string; email: string },
	link: DemoCustomerLink,
) {
	const { organizationId } = link;
	const [owner] = await tx
		.select({ id: customer.id })
		.from(customer)
		.where(
			and(
				eq(customer.organizationId, organizationId),
				link.customer ? eq(customer.name, link.customer) : undefined,
			),
		)
		.orderBy(asc(customer.id))
		.limit(1);
	if (!owner) throw new Error(`No customer ${link.customer ?? ""} in ${organizationId}`);
	await tx.insert(portalContact).values({
		organizationId,
		customerId: owner.id,
		email: contact.email,
		userId: contact.id,
		allSites: true,
		createdAt: toMoment(addDays(now, -60)),
	});
	if (!link.reports?.length) return;

	const units = await tx
		.select({ id: equipment.id })
		.from(equipment)
		.where(and(eq(equipment.organizationId, organizationId), eq(equipment.customerId, owner.id)))
		.orderBy(asc(equipment.id));
	const decider = await planner(tx, organizationId);
	const start = sequenceStart("order");
	const [{ last }] = await tx
		.select({
			last: sql<number>`coalesce(max(cast(substr(${order.number}, ${start}) as integer)), 0)`,
		})
		.from(order)
		.where(eq(order.organizationId, organizationId));
	for (const [i, report] of link.reports.entries()) {
		const createdAt = toMoment(new Date(now.getTime() - report.hoursAgo * 60 * 60 * 1000));
		const decidedAt = report.decision ? createdAt.add({ hours: 2 }) : null;
		const rejectionReason =
			report.decision && "rejectionReason" in report.decision
				? report.decision.rejectionReason
				: null;
		const status = !report.decision
			? "awaiting_acceptance"
			: rejectionReason
				? "cancelled"
				: "quote";
		const number = formatCode("order", Number(last) + i + 1);
		const [created] = await tx
			.insert(order)
			.values({
				organizationId,
				number,
				customerId: owner.id,
				type: "breakdown",
				status,
				priority: report.priority,
				description: report.description,
				createdAt,
			})
			.returning({ id: order.id });
		const unit = units[i % units.length];
		if (unit) {
			await tx.insert(orderUnit).values({
				organizationId,
				orderId: created.id,
				customerId: owner.id,
				equipmentId: unit.id,
				position: 0,
			});
		}
		await tx.insert(orderRequest).values({
			orderId: created.id,
			organizationId,
			userId: contact.id,
			reporterName: contact.name,
			decidedAt,
			decidedBy: decidedAt ? decider?.id : null,
			rejectionReason,
		});
		const subject = { subjectType: "order", subjectId: String(created.id), subjectLabel: number };
		await tx.insert(activity).values({
			organizationId,
			userId: contact.id,
			userName: contact.name,
			action: "created",
			...subject,
			createdAt,
		});
		if (decidedAt && decider) {
			await tx.insert(activity).values({
				organizationId,
				userId: decider.id,
				userName: decider.name,
				action: rejectionReason ? "rejected" : "accepted",
				...subject,
				changes: { status: ["awaiting_acceptance", status] },
				note: rejectionReason,
				createdAt: decidedAt,
			});
		}
	}
}
