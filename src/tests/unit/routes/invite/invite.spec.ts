/**
 * Accepting a customer contact's invitation (`/invite/[id]`) whose contact was revoked meanwhile:
 * better-auth's acceptance (whose own effects are e2e's, `src/tests/e2e/client.access.test.ts`)
 * makes the membership, which goes again, since a customer's role without a contact has no
 * customer to see; and the form says the invitation is no longer valid.
 */
import { afterEach, expect, test, vi } from "vite-plus/test";

import { auth } from "#lib/server/auth/index.ts";
import { acceptInvitation } from "#routes/invite/[id]/invite.remote.ts";
import {
	as,
	north,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

afterEach(() => vi.restoreAllMocks());

test("a contact revoked while their invitation is accepted gets no membership", async () => {
	// North's engineer, invited to SHLTR as a customer's contact whose access is gone already.
	const invitee = north.engineer;
	await rows(
		`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
		 values ('invitation-revoked', ?, ?, 'customer', 'pending', ?,
		 (select id from user where email = ?))`,
		[shltrId, invitee.email, Date.now() + 3_600_000, shltr.owner.email],
	);
	const userId = await value<string>(`select id from user where email = ?`, [invitee.email]);
	// better-auth's acceptance: the membership.
	vi.spyOn(auth.api, "acceptInvitation").mockImplementation((async () => {
		await rows(
			`insert into member (id, organization_id, user_id, role, created_at)
			 values ('member-revoked', ?, ?, 'customer', ?)`,
			[shltrId, userId, Date.now()],
		);
	}) as never);
	const answer = await as(invitee, () => submit(acceptInvitation, { id: "invitation-revoked" }));
	expect(answer.issues?.map((issue) => issue.message)).toEqual([
		"This invitation can no longer be accepted.",
	]);
	expect(
		await value(`select count(*) from member where organization_id = ? and user_id = ?`, [
			shltrId,
			userId,
		]),
	).toBe(0);
});
