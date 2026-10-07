import { describe, expect, test } from "vite-plus/test";

import {
	assignableRoles,
	canManageMembers,
	invitationState,
	parseRoles,
	removalRefusal,
	roleChangeRefusal,
} from "./members.ts";

const owner = { userId: "owner", roles: ["owner"] };
const otherOwner = { userId: "owner-2", roles: ["owner"] };
const admin = { userId: "admin", roles: ["admin"] };
const member = { userId: "member", roles: ["member"] };

test("roles are stored comma-separated", () => {
	expect(parseRoles("owner")).toEqual(["owner"]);
	expect(parseRoles("admin, member")).toEqual(["admin", "member"]);
	expect(parseRoles("")).toEqual([]);
});

test("owners and admins manage members", () => {
	expect(canManageMembers(["owner"])).toBe(true);
	expect(canManageMembers(["admin"])).toBe(true);
	expect(canManageMembers(["member"])).toBe(false);
});

describe("changing a role", () => {
	test("an owner can change anyone else's", () => {
		expect(roleChangeRefusal({ actor: owner, target: member, owners: 1 }, "admin")).toBeNull();
		expect(roleChangeRefusal({ actor: owner, target: member, owners: 1 }, "owner")).toBeNull();
		expect(roleChangeRefusal({ actor: owner, target: otherOwner, owners: 2 }, "member")).toBeNull();
	});

	test("an admin can change admins and members, but not to or from owner", () => {
		expect(roleChangeRefusal({ actor: admin, target: member, owners: 1 }, "admin")).toBeNull();
		expect(roleChangeRefusal({ actor: admin, target: member, owners: 1 }, "owner")).toBe(
			"Only owners can make someone an owner.",
		);
		expect(roleChangeRefusal({ actor: admin, target: otherOwner, owners: 2 }, "member")).toBe(
			"Only owners can change an owner's role.",
		);
	});

	test("a member can't change roles", () => {
		expect(roleChangeRefusal({ actor: member, target: admin, owners: 1 }, "member")).toBe(
			"Only owners and admins can change roles.",
		);
	});

	test("nobody can change their own role", () => {
		expect(roleChangeRefusal({ actor: owner, target: owner, owners: 2 }, "admin")).toBe(
			"You can't change your own role.",
		);
		expect(roleChangeRefusal({ actor: admin, target: admin, owners: 1 }, "member")).toBe(
			"You can't change your own role.",
		);
	});

	test("the last owner can't be demoted", () => {
		expect(roleChangeRefusal({ actor: owner, target: owner, owners: 1 }, "admin")).toMatch(
			/at least one owner/,
		);
		expect(roleChangeRefusal({ actor: admin, target: owner, owners: 1 }, "member")).toMatch(
			/at least one owner/,
		);
	});
});

describe("removing a member", () => {
	test("an owner can remove anyone else", () => {
		expect(removalRefusal({ actor: owner, target: admin, owners: 1 })).toBeNull();
		expect(removalRefusal({ actor: owner, target: otherOwner, owners: 2 })).toBeNull();
	});

	test("an admin can remove admins and members, not owners", () => {
		expect(removalRefusal({ actor: admin, target: member, owners: 1 })).toBeNull();
		expect(removalRefusal({ actor: admin, target: otherOwner, owners: 2 })).toBe(
			"Only owners can remove an owner.",
		);
	});

	test("nobody can remove themselves, and the last owner stays", () => {
		expect(removalRefusal({ actor: owner, target: owner, owners: 2 })).toBe(
			"You can't remove yourself.",
		);
		expect(removalRefusal({ actor: owner, target: owner, owners: 1 })).toMatch(
			/last owner can't be removed/,
		);
	});

	test("a member can't remove anyone", () => {
		expect(removalRefusal({ actor: member, target: admin, owners: 1 })).toBe(
			"Only owners and admins can remove members.",
		);
	});
});

test("only owners can invite or promote owners", () => {
	expect(assignableRoles(["owner"])).toEqual(["owner", "admin", "member", "engineer"]);
	expect(assignableRoles(["admin"])).toEqual(["admin", "member", "engineer"]);
	expect(assignableRoles(["member"])).toEqual([]);
});

describe("invitation state", () => {
	const now = new Date("2026-10-07T12:00:00Z");
	const later = new Date("2026-10-08T12:00:00Z");
	const earlier = new Date("2026-10-06T12:00:00Z");

	test("a pending invitation can be accepted until it expires", () => {
		expect(invitationState({ status: "pending", expiresAt: later }, now)).toBe("pending");
		expect(invitationState({ status: "pending", expiresAt: earlier }, now)).toBe("expired");
		expect(invitationState({ status: "pending", expiresAt: now }, now)).toBe("expired");
	});

	test("used and cancelled invitations stay that way", () => {
		expect(invitationState({ status: "accepted", expiresAt: later }, now)).toBe("accepted");
		expect(invitationState({ status: "canceled", expiresAt: later }, now)).toBe("canceled");
		expect(invitationState({ status: "rejected", expiresAt: later }, now)).toBe("rejected");
		expect(invitationState({ status: "something-else", expiresAt: later }, now)).toBe("canceled");
	});
});
