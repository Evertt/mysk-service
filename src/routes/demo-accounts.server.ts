/**
 * The SHLTR demo's one-click sign-in (`demo.remote.ts`: the login page's buttons and the user
 * menus' "View as"): which demo user each role signs in as, and whether an account is that user.
 * The client sends only a role's name; the account is fixed here, never taken from the request.
 */
import { isCustomerContact, isFieldEngineer, isManager } from "#lib/auth/index.ts";
import { demoOrganizations } from "#lib/server/db/demo.ts";

import { type DemoRole, demoRoles } from "./demo-roles.ts";

interface DemoAccount {
	/** The demo user's email (`demoUsers` in `#lib/server/db/demo.ts`). */
	email: string;
	/** Whether the account's roles in SHLTR are the ones this button is for. */
	hasRole(roles: readonly string[]): boolean;
	/** Where the role starts: the office dashboard, the engineer portal, the customer portal. */
	home: string;
}

/** The organization every demo account is in, and the session works in. */
export const demoOrganizationId = demoOrganizations.shltr.id;

const demoAccounts: Record<DemoRole, DemoAccount> = {
	// Jan Weggemans, SHLTR's planner: in the office, managing nothing (no owner or admin, see
	// `demo-roles.ts`).
	planner: {
		email: "jan@shltr.example",
		hasRole: (roles) => roles.includes("member") && !isManager(roles),
		home: "/",
	},
	// Lev Hoekstra, SHLTR's field engineer.
	engineer: { email: "lev@shltr.example", hasRole: isFieldEngineer, home: "/my" },
	// Marieke Verhoeven, Riedel's facilities contact (a partner with a wallet).
	customer: { email: "facilitair@riedel.example", hasRole: isCustomerContact, home: "/portal" },
};

/** The account a demo button signs in as, or `undefined` for anything that isn't a demo role. */
export const demoAccount = (role: unknown): DemoAccount | undefined =>
	typeof role === "string" && (demoRoles as readonly string[]).includes(role)
		? demoAccounts[role as DemoRole]
		: undefined;

/** The demo role whose account has `email`, or `undefined` for anyone else. */
export const demoRoleOf = (email: string): DemoRole | undefined =>
	demoRoles.find((role) => demoAccounts[role].email === email);
