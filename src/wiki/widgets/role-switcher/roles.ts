/**
 * What `<RoleSwitcher>` shows: the SHLTR demo's three roles (`demoRoles`, as the login page's
 * buttons have them), the shell each lands in, where that shell starts (`shells[shell].home`, read
 * from the app, so it can't drift), and in plain words what the role can and can't do there. The
 * words are written from the shell's pages (`src/routes/(app)`, `(field)/my`,
 * `(customer)/portal`); the shells themselves are `#lib/auth/shells.ts`.
 */
import { type ShellName, shells } from "#lib/auth/shells.ts";
import type { DemoRole } from "#routes/demo-roles.ts";

export interface RoleCard {
	role: DemoRole;
	shell: ShellName;
	/** Where the shell starts: the page the role lands on after signing in. */
	home: string;
	/** What the role can do, in plain English. */
	can: string[];
	/** What it can't, where that's worth knowing. */
	cannot: string[];
}

/** The shells' names as people say them. */
export const shellTitles: Record<ShellName, string> = {
	office: "The office app",
	engineer: "The engineer portal",
	customer: "The customer portal",
};

const card = (role: DemoRole, shell: ShellName, can: string[], cannot: string[]): RoleCard => ({
	role,
	shell,
	home: shells[shell].home,
	can,
	cannot,
});

export const roleCards: readonly RoleCard[] = [
	card(
		"planner",
		"office",
		[
			"See every order, customer, unit and engineer of the organization, and what changed lately.",
			"Create and edit orders, and give them a status.",
			"Plan an order: an engineer, a day and a time.",
			"Accept or reject the breakdowns customers report.",
		],
		["Change the organization's settings or members: those are for owners and admins."],
	),
	card(
		"engineer",
		"engineer",
		[
			"See their own orders, by day: only the ones planned for them.",
			"Start a job, log the hours and add notes.",
			"Complete a job with the customer's signature and their own.",
			"Look up a unit or a place by scanning its QR code.",
		],
		["See other engineers' orders, or the office app."],
	),
	card(
		"customer",
		"customer",
		[
			"Report a breakdown, on a unit or from a QR code.",
			"Follow their orders: waiting to be accepted, planned, done, or rejected with the reason.",
			"See their units and locations, with each unit's service history.",
			"Read the work done on a finished order: the sign-off, and with the checklists module the work order.",
		],
		["See any other customer's records."],
	),
];
