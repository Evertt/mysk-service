import { describe, expect, test } from "vite-plus/test";

import { demoOrganizations, demoUsers } from "#lib/server/db/demo.ts";
import { demoAccount, demoOrganizationId, demoRoleOf } from "#routes/demo-accounts.server.ts";
import { demoRoles } from "#routes/demo-roles.ts";

describe("demoAccount", () => {
	test("maps each role to its fixed SHLTR demo user and home", () => {
		expect(
			demoRoles.map((role) => [role, demoAccount(role)?.email, demoAccount(role)?.home]),
		).toEqual([
			["admin", "owner@shltr.example", "/"],
			["engineer", "lev@shltr.example", "/my"],
			["customer", "facilitair@riedel.example", "/portal"],
		]);
		expect(demoOrganizationId).toBe(demoOrganizations.shltr.id);
	});

	test("each account is a seeded demo user in SHLTR with the role its button is for", () => {
		for (const role of demoRoles) {
			const account = demoAccount(role)!;
			const seeded = demoUsers.find((user) => user.email === account.email);
			expect(seeded?.memberships, role).toEqual([
				{ organizationId: demoOrganizationId, role: expect.any(String) },
			]);
			expect(account.hasRole([seeded!.memberships[0].role]), role).toBe(true);
		}
	});

	test("checks the role of the account", () => {
		expect(demoAccount("admin")!.hasRole(["member"])).toBe(false);
		expect(demoAccount("engineer")!.hasRole(["owner"])).toBe(false);
		expect(demoAccount("engineer")!.hasRole(["engineer", "admin"])).toBe(false);
		expect(demoAccount("customer")!.hasRole(["member"])).toBe(false);
		expect(demoAccount("customer")!.hasRole(["customer", "owner"])).toBe(false);
	});

	test("knows the role of each demo account, and of no one else", () => {
		for (const role of demoRoles) expect(demoRoleOf(demoAccount(role)!.email)).toBe(role);
		for (const email of [
			"jan@shltr.example",
			"admin@fieldworks.example",
			"OWNER@shltr.example",
			"",
			"admin",
		]) {
			expect(demoRoleOf(email), email).toBeUndefined();
		}
	});

	test("refuses anything else: other names, emails, ids, prototype keys and non-strings", () => {
		for (const role of [
			"owner",
			"Admin",
			"planner",
			"owner@shltr.example",
			"admin@fieldworks.example",
			"",
			"constructor",
			"__proto__",
			"toString",
			undefined,
			null,
			1,
			["admin"],
			{ role: "admin" },
		]) {
			expect(demoAccount(role), JSON.stringify(role)).toBeUndefined();
		}
	});
});
