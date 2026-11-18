/**
 * A head office in the customer portal: Distributiecentrum Zutphen, one of SHLTR's made-up
 * customers, has three sites (Zutphen, Deventer and Culemborg), and its contact `HEAD_OFFICE` sees
 * all of them (`customerIn` in `../demo.ts`), so the sites overview (`/portal/sites`) has a story to
 * tell, worst first: at Zutphen a fault she reported this morning awaits acceptance (besides what
 * was open there), at Deventer an engineer is on the way, and Culemborg is all fine. Made last, after
 * the unit story, so every other order keeps its number and the other demo users their data.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { formatCode, sequenceStart } from "#lib/numbering.ts";
import type { Transaction } from "#lib/server/db/index.ts";

import { HEAD_OFFICE } from "../demo.ts";
import * as schema from "../schema.ts";
import { HOUR, MINUTE, now } from "./clock.ts";
import { toMoment } from "./temporal.ts";

const { activity, customer, customerSite, engineer, equipment, order, orderRequest, orderUnit } =
	schema;

/** What happens at each site: the fault she reported, and the engineer on his way. */
const story = {
	fault: {
		site: "Zutphen",
		description: "Overheaddeur dock 3 sluit niet meer, de vrachtwagens staan te wachten.",
		hoursAgo: 2,
	},
	visit: {
		site: "Deventer",
		description: "Veren en kabels van de snelroldeur nalopen, deur loopt scheef.",
		minutesAgo: 15,
	},
} as const;

/** The first unit at the customer's site `site`, by name. */
async function unitAt(tx: Transaction, organizationId: string, customerId: number, site: string) {
	const [found] = await tx
		.select({ id: equipment.id })
		.from(equipment)
		.innerJoin(
			customerSite,
			and(
				eq(customerSite.id, equipment.siteId),
				eq(customerSite.organizationId, equipment.organizationId),
			),
		)
		.where(
			and(
				eq(equipment.organizationId, organizationId),
				eq(equipment.customerId, customerId),
				eq(customerSite.name, site),
			),
		)
		.orderBy(asc(equipment.id))
		.limit(1);
	if (!found) throw new Error(`No unit of ${HEAD_OFFICE.customer} at ${site}`);
	return found;
}

/** The order numbers after the tenant's last, one per call. */
async function numbering(tx: Transaction, organizationId: string) {
	const start = sequenceStart("order");
	const [{ last }] = await tx
		.select({
			last: sql<number>`coalesce(max(cast(substr(${order.number}, ${start}) as integer)), 0)`,
		})
		.from(order)
		.where(eq(order.organizationId, organizationId));
	let next = Number(last);
	return () => formatCode("order", ++next);
}

/** Enters the head office's story in `organizationId` (SHLTR's); nothing without its customer. */
export async function seedHeadOffice(tx: Transaction, organizationId: string) {
	const [owner] = await tx
		.select({ id: customer.id })
		.from(customer)
		.where(
			and(eq(customer.organizationId, organizationId), eq(customer.name, HEAD_OFFICE.customer)),
		);
	const userBy = async (email: string) =>
		(
			await tx
				.select({ id: schema.user.id, name: schema.user.name })
				.from(schema.user)
				.where(eq(schema.user.email, email))
		).at(0);
	const [contact, planner] = await Promise.all([
		userBy(HEAD_OFFICE.email),
		userBy("jan@shltr.example"),
	]);
	// An engineer of the office's, not the demo engineer's (the first active one) nor the unit
	// story's (the second): the third.
	const [fitter] = await tx
		.select({ id: engineer.id, name: engineer.name })
		.from(engineer)
		.where(and(eq(engineer.organizationId, organizationId), eq(engineer.active, true)))
		.orderBy(asc(engineer.id))
		.limit(1)
		.offset(2);
	if (!owner || !contact || !planner || !fitter) return;
	const nextNumber = await numbering(tx, organizationId);

	/** Makes an order of the customer on `unitId`, and answers its subject in the log. */
	const makeOrder = async (
		unitId: number,
		values: Omit<typeof order.$inferInsert, "number" | "organizationId" | "customerId">,
	) => {
		const number = nextNumber();
		const [created] = await tx
			.insert(order)
			.values({ organizationId, number, customerId: owner.id, ...values })
			.returning({ id: order.id });
		await tx.insert(orderUnit).values({
			organizationId,
			orderId: created.id,
			customerId: owner.id,
			equipmentId: unitId,
			position: 0,
		});
		return {
			id: created.id,
			subject: { subjectType: "order", subjectId: String(created.id), subjectLabel: number },
		};
	};

	// The fault she reported at Zutphen, awaiting the office's acceptance.
	const reportedAt = toMoment(new Date(now.getTime() - story.fault.hoursAgo * HOUR));
	const fault = await makeOrder((await unitAt(tx, organizationId, owner.id, story.fault.site)).id, {
		type: "breakdown",
		status: "awaiting_acceptance",
		priority: "urgent",
		description: story.fault.description,
		createdAt: reportedAt,
	});
	await tx.insert(orderRequest).values({
		orderId: fault.id,
		organizationId,
		userId: contact.id,
		reporterName: contact.name,
		reporterLocale: "nl",
	});
	await tx.insert(activity).values({
		organizationId,
		userId: contact.id,
		userName: contact.name,
		action: "created",
		...fault.subject,
		createdAt: reportedAt,
	});

	// The engineer on his way to Deventer, planned for now.
	const plannedAt = toMoment(new Date(now.getTime() - 3 * 24 * HOUR));
	const departedAt = toMoment(new Date(now.getTime() - story.visit.minutesAgo * MINUTE));
	const scheduledFor = toMoment(new Date(now.getTime() + 15 * MINUTE));
	const visit = await makeOrder((await unitAt(tx, organizationId, owner.id, story.visit.site)).id, {
		engineerId: fitter.id,
		type: "repair",
		status: "on_the_way",
		priority: "normal",
		description: story.visit.description,
		scheduledFor,
		createdAt: plannedAt,
	});
	const byPlanner = { organizationId, userId: planner.id, userName: planner.name };
	await tx.insert(activity).values([
		{ ...byPlanner, action: "created", ...visit.subject, createdAt: plannedAt },
		{
			...byPlanner,
			action: "scheduled",
			...visit.subject,
			changes: {
				status: ["quote", "scheduled"],
				engineerId: [null, fitter.id],
				scheduledFor: [null, scheduledFor.toString()],
			},
			createdAt: plannedAt,
		},
		{
			organizationId,
			userName: fitter.name,
			action: "departed",
			...visit.subject,
			changes: { status: ["scheduled", "on_the_way"] },
			createdAt: departedAt,
		},
	]);
}
