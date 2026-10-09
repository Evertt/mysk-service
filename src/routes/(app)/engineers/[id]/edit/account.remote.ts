import { form, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import * as v from "valibot";

import { isManager } from "#lib/auth";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity";
import { idInTenant, inTenant, requireManager, requireMember } from "#lib/server/auth";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, member, user } from "#lib/server/db/schema.ts";

/**
 * The user account an engineer signs in to the engineer portal with, and (for owners and admins)
 * the organization's members it can be linked to: those not linked to another engineer.
 */
export const getEngineerAccount = query(v.number(), async (engineerId) => {
	const tenant = requireMember();
	const found = await db.query.engineer.findFirst({
		columns: { id: true, userId: true },
		where: idInTenant(engineer, engineerId),
	});
	if (!found) error(404, m.engineers_not_found());

	const canManage = isManager(tenant.roles);
	const [members, taken] = await Promise.all([
		db
			.select({ userId: user.id, name: user.name, email: user.email, role: member.role })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, tenant.organizationId))
			.orderBy(asc(user.name)),
		db
			.select({ userId: engineer.userId })
			.from(engineer)
			.where(and(inTenant(engineer), ne(engineer.id, found.id))),
	]);
	const linkedElsewhere = new Set(taken.map((row) => row.userId));
	return {
		canManage,
		linked: members.find((m) => m.userId === found.userId) ?? null,
		members: canManage ? members.filter((m) => !linkedElsewhere.has(m.userId)) : [],
	};
});

/** Links an engineer to a member's user account, or unlinks them (an empty `userId`). */
export const linkEngineerAccount = form(
	v.object({ id: id(), userId: v.string() }),
	async (input, issue) => {
		const { organizationId } = requireManager();
		const found = await db.query.engineer.findFirst({
			columns: { id: true, name: true, userId: true },
			where: idInTenant(engineer, input.id),
		});
		if (!found) error(404, m.engineers_not_found());

		const userId = input.userId || null;
		if (userId) {
			const [membership] = await db
				.select({ id: member.id })
				.from(member)
				.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
			if (!membership) invalid(issue.userId(m.engineers_account_not_member()));
			const other = await db.query.engineer.findFirst({
				columns: { name: true },
				where: and(inTenant(engineer), eq(engineer.userId, userId), ne(engineer.id, found.id)),
			});
			if (other) invalid(issue.userId(m.engineers_account_taken({ name: other.name })));
		}
		await db.transaction(async (tx) => {
			await tx.update(engineer).set({ userId }).where(idInTenant(engineer, found.id));
			// The accounts by name (user ids mean nothing to a reader).
			const names = await accountNames(tx, [found.userId, userId]);
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "engineer", id: found.id, label: found.name },
				before: { account: found.userId && names.get(found.userId) },
				after: { account: userId && names.get(userId) },
			});
		});
		void getEngineerAccount(found.id).refresh();
	},
);

/** The names and email addresses of these users, by id. */
async function accountNames(tx: Transaction, ids: (string | null)[]) {
	const wanted = ids.filter((id) => id !== null);
	if (!wanted.length) return new Map<string, string>();
	const found = await tx
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, wanted));
	return new Map(found.map((row) => [row.id, `${row.name} (${row.email})`]));
}
