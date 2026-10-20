/**
 * The SHLTR demo's one-click sign-in (`demo.remote.ts`: the login page's buttons and the user
 * menus' "View as"): which demo user each role signs in as, and whether an account is that user.
 * The client sends only a role's name; the account is fixed here, never taken from the request.
 */
import { isManager, type ShellName, shellOf, shells } from "#lib/auth/index.ts";
import { demoOrganizations } from "#lib/server/db/demo.ts";

import { type DemoRole, demoRoles } from "./demo-roles.ts";

interface DemoAccount {
	/** The demo user's email (`demoUsers` in `#lib/server/db/demo.ts`). */
	email: string;
	/** Whether the account's roles in SHLTR are the ones this button is for. */
	hasRole(roles: readonly string[]): boolean;
	/** Where the role starts: its shell's home (the office dashboard, either portal). */
	home: string;
}

/** The organization every demo account is in, and the session works in. */
export const demoOrganizationId = demoOrganizations.shltr.id;

/** The demo user `email`, whose roles put them in `shell` (and pass `also`), starting at its home. */
const inShell = (
	email: string,
	shell: ShellName,
	also: (roles: readonly string[]) => boolean = () => true,
): DemoAccount => ({
	email,
	hasRole: (roles) => shellOf(roles).name === shell && also(roles),
	home: shells[shell].home,
});

const demoAccounts: Record<DemoRole, DemoAccount> = {
	// Jan Weggemans, SHLTR's planner: in the office, managing nothing (no owner or admin, see
	// `demo-roles.ts`).
	planner: inShell(
		"jan@shltr.example",
		"office",
		(roles) => roles.includes("member") && !isManager(roles),
	),
	// Lev Hoekstra, SHLTR's field engineer.
	engineer: inShell("lev@shltr.example", "engineer"),
	// Marieke Verhoeven, Riedel's facilities contact (a partner with a wallet).
	customer: inShell("facilitair@riedel.example", "customer"),
};

/** The account a demo button signs in as, or `undefined` for anything that isn't a demo role. */
export const demoAccount = (role: unknown): DemoAccount | undefined =>
	typeof role === "string" && (demoRoles as readonly string[]).includes(role)
		? demoAccounts[role as DemoRole]
		: undefined;

/** The demo role whose account has `email`, or `undefined` for anyone else. */
export const demoRoleOf = (email: string): DemoRole | undefined =>
	demoRoles.find((role) => demoAccounts[role].email === email);
