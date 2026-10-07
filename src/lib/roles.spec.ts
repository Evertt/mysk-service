import { describe, expect, test } from "vite-plus/test";

import { isFieldEngineer, memberRoles, officeRoles, roleDescriptions } from "./roles.ts";

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

test("every role has a description, and every role but engineer works in the office", () => {
	expect(Object.keys(roleDescriptions)).toEqual([...memberRoles]);
	expect(memberRoles.filter((role) => !(officeRoles as readonly string[]).includes(role))).toEqual([
		"engineer",
	]);
});
