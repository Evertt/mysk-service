import { describe, expect, test } from "vite-plus/test";

import { shellOf, shells } from "#lib/auth/shells.ts";
import { demoRoles } from "#routes/demo-roles.ts";
import { roleCards } from "#wiki/widgets/role-switcher/roles.ts";

/** The roles the demo's accounts have in SHLTR (README, "Demo login"): what `shellOf()` goes by. */
const demoMemberRoles = {
	planner: ["member"],
	engineer: ["engineer"],
	customer: ["customer"],
} as const;

describe("the role switcher's cards", () => {
	test("there is a card per demo role, in the login page's order", () => {
		expect(roleCards.map((card) => card.role)).toEqual([...demoRoles]);
	});

	test("each card's home is its shell's home", () => {
		for (const card of roleCards) {
			expect(card.home, card.role).toBe(shells[card.shell].home);
		}
	});

	test("each card's shell is where the demo role lands", () => {
		for (const card of roleCards) {
			expect(card.shell, card.role).toBe(shellOf(demoMemberRoles[card.role]).name);
		}
	});

	test("each card says what the role can do", () => {
		for (const card of roleCards) {
			expect(card.can.length, card.role).toBeGreaterThan(2);
			expect(
				card.can.every((line) => line.trim() !== ""),
				card.role,
			).toBe(true);
		}
	});
});
