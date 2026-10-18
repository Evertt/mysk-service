/**
 * What a customer's portal access refuses before better-auth sends an invitation (whose effects,
 * the mail, the account, the revoked membership, are e2e's): someone with access or invited
 * already, a member of the team, a site of another customer; a planner inviting or revoking; and
 * that the members page has neither the contacts nor their invitations. The server side of
 * `src/tests/e2e/client.access.test.ts`.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	getPortalAccess,
	invitePortalContact,
	revokePortalContact,
} from "#lib/customers/detail/portal-access.remote.ts";
import { demoUsers } from "#lib/server/db/demo.ts";
import { getMembers } from "#routes/(app)/settings/members/members.remote.ts";
import {
	as,
	data,
	organizationId,
	rows,
	shltr,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");
const riedel = shltr.customer;

/** Vermeer's id and code, and its sites by name. */
const vermeer = async () => {
	const sites = await rows<{ id: number; name: string; customer: number; code: string }>(
		`select s.id, s.name, c.id as customer, c.code from customer_site s
		 join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = 'Vermeer Logistiek' order by s.id`,
		[shltrId],
	);
	return { id: sites[0].customer, code: sites[0].code, sites };
};

const messages = (answer: { issues?: { message: string }[] }) =>
	answer.issues?.map((issue) => issue.message) ?? [];

describe("inviting a contact to the portal", () => {
	test("refuses someone with access already, one of the team, and another customer's site", async () => {
		const { id } = await vermeer();
		// A contact invited already, who hasn't made their account yet.
		const invited = "invited@vermeerlogistiek.example";
		await rows(
			`insert into portal_contact (organization_id, customer_id, email, all_sites)
			 values (?, ?, ?, 1)`,
			[shltrId, id, invited],
		);
		const contacts = () => value<number>(`select count(*) from portal_contact`);
		const before = await contacts();
		const otherSite = await value<number>(
			`select s.id from customer_site s join customer c on c.id = s.customer_id
			 where c.organization_id = ? and c.name = 'Riedel B.V.' limit 1`,
			[shltrId],
		);
		await as(shltr.owner, async () => {
			expect(
				messages(await submit(invitePortalContact, { customerId: String(id), email: invited })),
			).toEqual([`${invited} has been invited already.`]);
			// A contact with an account is a member (of the customer role).
			expect(
				messages(
					await submit(invitePortalContact, { customerId: String(id), email: riedel.email }),
				),
			).toEqual([`${riedel.email} is a member of the organization already.`]);
			const planner = demoUsers.find((user) => user.email === shltr.member.email)!;
			expect(
				messages(
					await submit(invitePortalContact, { customerId: String(id), email: planner.email }),
				),
			).toEqual([`${planner.email} is a member of the organization already.`]);
			const answer = await submit(invitePortalContact, {
				customerId: String(id),
				email: "k.smit@vermeerlogistiek.example",
				siteIds: [String(otherSite)],
			});
			expect(answer.status).toBe(400);
			expect(answer.issues?.map((issue) => issue.name)).toEqual(["siteIds"]);
		});
		expect(await contacts()).toBe(before);
	});

	test("isn't a planner's: they see who has access, but can't invite or revoke", async () => {
		const { id, code } = await vermeer();
		const contact = await value<number>(
			`select id from portal_contact where email = ? and organization_id = ?`,
			[riedel.email, shltrId],
		);
		await as(shltr.member, async () => {
			const access = await data(getPortalAccess, code);
			expect(access.canManage).toBe(false);
			expect(
				await submit(invitePortalContact, {
					customerId: String(id),
					email: "k.smit@vermeerlogistiek.example",
				}),
			).toMatchObject({ status: 403 });
			expect(await submit(revokePortalContact, { id: String(contact) })).toMatchObject({
				status: 403,
			});
		});
		expect(await value(`select count(*) from portal_contact where id = ?`, [contact])).toBe(1);
	});
});

describe("the members page", () => {
	test("has neither the customers' contacts nor their invitations", async () => {
		// A contact's invitation, as better-auth stores it for `invitePortalContact`.
		await rows(
			`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
			 values ('invitation-karin', ?, 'k.smit@vermeerlogistiek.example', 'customer', 'pending', ?,
			 (select id from user where email = ?))`,
			[shltrId, Date.now() + 7 * 24 * 3_600_000, shltr.owner.email],
		);
		const { members, invitations } = await as(shltr.owner, () => data(getMembers));
		expect(members.map((member) => member.email)).not.toContain(riedel.email);
		expect(invitations.map((invitation) => invitation.email)).not.toContain(
			"k.smit@vermeerlogistiek.example",
		);
		expect(members.map((member) => member.email)).toContain(shltr.member.email);
	});
});
