/**
 * What `<RoleSwitcher>` shows: the SHLTR demo's three roles (`demoRoles`, as the login page's
 * buttons have them), the shell each lands in, where that shell starts (`shells[shell].home`, read
 * from the app, so it can't drift), and in plain words what the role can and can't do there. The
 * words are written from the shell's pages (`src/routes/(app)`, `(field)/my`,
 * `(customer)/portal`); the shells themselves are `#lib/auth/shells.ts`. The words are message
 * functions, read where they are shown.
 */
import { type ShellName, shells } from "#lib/auth/shells.ts";
import { m } from "#lib/paraglide/messages.js";
import type { DemoRole } from "#routes/demo-roles.ts";

export interface RoleCard {
	role: DemoRole;
	shell: ShellName;
	/** Where the shell starts: the page the role lands on after signing in. */
	home: string;
	/** What the role can do, in plain words. */
	can: (() => string)[];
	/** What it can't, where that's worth knowing. */
	cannot: (() => string)[];
}

/** The shells' names as people say them. */
export const shellTitles: Record<ShellName, () => string> = {
	office: m.wiki_roles_shell_office,
	engineer: m.wiki_roles_shell_engineer,
	customer: m.wiki_roles_shell_customer,
};

const card = (
	role: DemoRole,
	shell: ShellName,
	can: (() => string)[],
	cannot: (() => string)[],
): RoleCard => ({
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
			m.wiki_roles_planner_can_1,
			m.wiki_roles_planner_can_2,
			m.wiki_roles_planner_can_3,
			m.wiki_roles_planner_can_4,
		],
		[m.wiki_roles_planner_cannot_1],
	),
	card(
		"engineer",
		"engineer",
		[
			m.wiki_roles_engineer_can_1,
			m.wiki_roles_engineer_can_2,
			m.wiki_roles_engineer_can_3,
			m.wiki_roles_engineer_can_4,
		],
		[m.wiki_roles_engineer_cannot_1],
	),
	card(
		"customer",
		"customer",
		[
			m.wiki_roles_customer_can_1,
			m.wiki_roles_customer_can_2,
			m.wiki_roles_customer_can_3,
			() => m.wiki_roles_customer_can_4({ module: m.checklists_module_name() }),
		],
		[m.wiki_roles_customer_cannot_1],
	),
];
