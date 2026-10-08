import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Transaction } from "#lib/server/db/index.ts";

import { DEMO_PASSWORD, demoUsers } from "../demo.ts";
import * as schema from "../schema.ts";
import { now } from "./clock.ts";

const { account, engineer, order, session, user } = schema;

/**
 * Links a demo field engineer's account to their organization's first engineer, and plans some of
 * the organization's scheduled work (of engineers with the same specialty) for them: a job under
 * way and another one today, then a few on the next days, so the engineer portal has work to show.
 */
async function linkDemoEngineer(tx: Transaction, userId: string, organizationId: string) {
	const [first] = await tx
		.select({ id: engineer.id, specialty: engineer.specialty })
		.from(engineer)
		.where(and(eq(engineer.organizationId, organizationId), eq(engineer.active, true)))
		.orderBy(asc(engineer.id))
		.limit(1);
	await tx.update(engineer).set({ userId }).where(eq(engineer.id, first.id));

	const work = await tx
		.select({ id: order.id })
		.from(order)
		.innerJoin(engineer, eq(order.engineerId, engineer.id))
		.where(
			and(
				eq(order.organizationId, organizationId),
				eq(order.status, "scheduled"),
				eq(engineer.specialty, first.specialty),
			),
		)
		.orderBy(asc(order.id))
		.limit(4);
	const plan = [
		{ days: 0, hours: 8, minutes: 0, status: "in_progress" },
		{ days: 0, hours: 13, minutes: 30, status: "scheduled" },
		{ days: 1, hours: 9, minutes: 0, status: "scheduled" },
		{ days: 3, hours: 10, minutes: 30, status: "scheduled" },
	] as const;
	for (const [i, { id }] of work.entries()) {
		const { days, hours, minutes, status } = plan[i];
		const scheduledFor = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + days,
			hours,
			minutes,
		);
		await tx
			.update(order)
			.set({ engineerId: first.id, scheduledFor, status })
			.where(eq(order.id, id));
	}
}

/**
 * Demo users are recreated (with their password account, as better-auth's email sign-up would),
 * so a changed name or password always takes effect. Their sessions go with them.
 */
export async function createDemoUsers(tx: Transaction) {
	const existing = await tx
		.select({ id: user.id })
		.from(user)
		.where(
			inArray(
				user.email,
				demoUsers.map((u) => u.email),
			),
		);
	const ids = existing.map((u) => u.id);
	await tx.delete(session).where(inArray(session.userId, ids));
	await tx.delete(account).where(inArray(account.userId, ids));
	await tx.delete(user).where(inArray(user.id, ids));

	for (const { memberships, engineerIn, ...demo } of demoUsers) {
		const id = crypto.randomUUID();
		await tx.insert(user).values({ id, ...demo, emailVerified: true });
		await tx.insert(schema.member).values(
			// In order: the first is where they start when signing in.
			memberships.map((membership, i) => ({
				id: crypto.randomUUID(),
				userId: id,
				...membership,
				createdAt: new Date(now.getTime() - (memberships.length - i) * 1000),
			})),
		);
		await tx.insert(account).values({
			id: crypto.randomUUID(),
			accountId: id,
			providerId: "credential",
			userId: id,
			password: await hashPassword(DEMO_PASSWORD),
		});
		if (engineerIn) await linkDemoEngineer(tx, id, engineerIn);
	}
}
