import { describe, expect, test } from "vite-plus/test";

import {
	isCustomerContact,
	isFieldEngineer,
	isManager,
	memberRoles,
	officeRoles,
	parseRoles,
	teamRoles,
} from "#lib/auth/roles.ts";

describe("isFieldEngineer", () => {
	test("is a member whose only role is engineer", () => {
		expect(isFieldEngineer(["engineer"])).toBe(true);
	});

	test("isn't someone who also works in the office", () => {
		for (const role of officeRoles) expect(isFieldEngineer(["engineer", role]), role).toBe(false);
	});

	test("isn't an office member, nor someone without roles", () => {
		for (const role of officeRoles) expect(isFieldEngineer([role]), role).toBe(false);
		expect(isFieldEngineer([])).toBe(false);
	});
});

test("roles are stored comma-separated", () => {
	expect(parseRoles("owner")).toEqual(["owner"]);
	expect(parseRoles("admin, member")).toEqual(["admin", "member"]);
	expect(parseRoles("")).toEqual([]);
});

describe("isManager", () => {
	test("is an owner or an admin", () => {
		expect(isManager(["owner"])).toBe(true);
		expect(isManager(["admin"])).toBe(true);
		expect(isManager(["engineer", "admin"])).toBe(true);
	});

	test("isn't anyone else", () => {
		expect(isManager(["member"])).toBe(false);
		expect(isManager(["engineer"])).toBe(false);
		expect(isManager([])).toBe(false);
	});
});

test("every role but engineer and customer works in the office", () => {
	expect(memberRoles.filter((role) => !(officeRoles as readonly string[]).includes(role))).toEqual([
		"engineer",
		"customer",
	]);
});

test("the team's roles are all but the customer's", () => {
	expect(memberRoles.filter((role) => !(teamRoles as readonly string[]).includes(role))).toEqual([
		"customer",
	]);
});

describe("isCustomerContact", () => {
	test("is a member whose only role is customer", () => {
		expect(isCustomerContact(["customer"])).toBe(true);
	});

	test("isn't someone who is also one of the team, nor anyone else", () => {
		for (const role of teamRoles) {
			expect(isCustomerContact(["customer", role]), role).toBe(false);
			expect(isCustomerContact([role]), role).toBe(false);
		}
		expect(isCustomerContact([])).toBe(false);
	});

	test("isn't a field engineer", () => {
		expect(isFieldEngineer(["customer"])).toBe(false);
	});
});
