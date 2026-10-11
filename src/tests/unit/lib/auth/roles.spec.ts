import { describe, expect, test } from "vite-plus/test";

import {
	isFieldEngineer,
	isManager,
	memberRoles,
	officeRoles,
	parseRoles,
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

test("every role but engineer works in the office", () => {
	expect(memberRoles.filter((role) => !(officeRoles as readonly string[]).includes(role))).toEqual([
		"engineer",
	]);
});
