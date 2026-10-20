/**
 * What the members page's remote functions refuse before they hand a change to better-auth (whose
 * effects, sending an invitation, changing a role, removing a member, are e2e's): inviting a
 * member or someone invited already, changing one's own role, leaving the organization without an
 * owner, a planner managing members, and South reaching North's invitations and members by their
 * ids; and that the page lists the team without the customers' contacts. The server side of
 * `src/tests/e2e/members.test.ts` and `client.access.test.ts`.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { demoUsers } from "#lib/server/db/demo.ts";
import {
	cancelInvitation,
	changeRole,
	getMembers,
	invite,
	removeMember,
	resendInvitation,
} from "#routes/(app)/settings/members/members.remote.ts";
import {
	as,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const [admin, planner] = [demoUsers[0], demoUsers[1]];
/** Someone with a pending invitation to North. */
const invitee = "robin.rivera@example.com";

const memberId = (organization: string, email: string) =>
	value<string>(
		`select member.id from member join user on user.id = member.user_id
		 where member.organization_id = ? and user.email = ?`,
		[organization, email],
	);
const roleOf = (organization: string, email: string) =>
	value<string | undefined>(
		`select member.role from member join user on user.id = member.user_id
		 where member.organization_id = ? and user.email = ?`,
		[organization, email],
	);
const invitations = (email: string) =>
	rows<{ id: string; status: string; expires_at: number }>(
		`select id, status, expires_at from invitation where email = ? order by created_at`,
		[email],
	);
const messages = (answer: { issues?: { message: string }[] }) =>
	answer.issues?.map((issue) => issue.message) ?? [];

let invitationId: string;

beforeAll(async () => {
	// A pending invitation, as better-auth stores one (the harness can't send it).
	invitationId = "invitation-robin";
	await rows(
		`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
		 values (?, ?, ?, 'admin', 'pending', ?, (select id from user where email = ?))`,
		[invitationId, northId, invitee, Date.now() + 7 * 24 * 3_600_000, admin.email],
	);
});

describe("the members page", () => {
	test("lists the team, without the customers' contacts", async () => {
		const { members } = await as(north.owner, () => data(getMembers));
		const emails = members.map((member) => member.email);
		expect(emails).toEqual(expect.arrayContaining([admin.email, planner.email]));
		expect(emails).not.toContain(north.customer.email);
		// Nobody changes or removes themselves.
		const you = members.find((member) => member.isYou)!;
		expect(you).toMatchObject({ email: admin.email, roleOptions: [], canRemove: false });
		// A planner sees it read-only.
		const asPlanner = await as(north.member, () => data(getMembers));
		expect(asPlanner.invitations).toEqual([]);
		expect(
			asPlanner.members.every((member) => !member.canRemove && !member.roleOptions.length),
		).toBe(true);
	});
});

describe("inviting", () => {
	test("someone invited already, or a member, is refused", async () => {
		await as(north.owner, async () => {
			expect(messages(await submit(invite, { email: invitee, role: "member" }))).toEqual([
				`${invitee} has been invited already. Resend that invitation instead.`,
			]);
			expect(messages(await submit(invite, { email: planner.email, role: "member" }))).toEqual([
				`${planner.email} is already a member.`,
			]);
		});
		expect(await invitations(invitee)).toHaveLength(1);
		expect(await invitations(planner.email)).toHaveLength(0);
	});
});

describe("roles and removal", () => {
	test("nobody can change their own role, not even with a tampered form", async () => {
		const own = await memberId(northId, admin.email);
		// As the owner they are: the last one can't become anything else, which is refused first.
		const answer = await as(north.owner, () =>
			submit(changeRole, { memberId: own, role: "owner" }),
		);
		expect(messages(answer)).toEqual(["You can't change your own role."]);
		expect(await roleOf(northId, admin.email)).toBe("owner");
	});

	test("the last owner can't be demoted or removed", async () => {
		const own = await memberId(southId, admin.email);
		await as(south.owner, async () => {
			expect(messages(await submit(changeRole, { memberId: own, role: "admin" }))).toEqual([
				expect.stringMatching(/needs at least one owner/),
			]);
			expect(messages(await submit(removeMember, { id: own }))).toEqual([
				expect.stringMatching(/last owner can't be removed/),
			]);
		});
		expect(await roleOf(southId, admin.email)).toBe("owner");
	});

	test("a planner can't invite, change roles or remove anyone", async () => {
		const target = await memberId(northId, admin.email);
		await as(north.member, async () => {
			expect(await submit(changeRole, { memberId: target, role: "member" })).toMatchObject({
				status: 403,
			});
			expect(await submit(removeMember, { id: target })).toMatchObject({ status: 403 });
			expect(await submit(invite, { email: "sneaky@example.com", role: "admin" })).toMatchObject({
				status: 403,
			});
			expect(await submit(cancelInvitation, { id: invitationId })).toMatchObject({ status: 403 });
		});
		expect(await roleOf(northId, admin.email)).toBe("owner");
		expect(await invitations("sneaky@example.com")).toHaveLength(0);
		expect(await invitations(invitee)).toMatchObject([{ status: "pending" }]);
	});
});

describe("South", () => {
	test("can't cancel or resend North's invitations, nor change or remove North's members", async () => {
		const before = await invitations(invitee);
		const plannerInNorth = await memberId(northId, planner.email);
		await as(south.owner, async () => {
			for (const answer of [
				await submit(cancelInvitation, { id: invitationId }),
				await submit(resendInvitation, { id: invitationId }),
				await submit(changeRole, { memberId: plannerInNorth, role: "admin" }),
				await submit(removeMember, { id: plannerInNorth }),
			]) {
				expect(answer).toMatchObject({ status: 404 });
			}
		});
		expect(await invitations(invitee)).toEqual(before);
		expect(await roleOf(northId, planner.email)).toBe("member");
	});
});
