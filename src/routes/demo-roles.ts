/**
 * The SHLTR demo's roles, in their order on the login page's buttons and in the user menus' "View
 * as" (`view-as.svelte`), with their labels. Which account each is, and the checks, are the
 * server's (`demo-accounts.server.ts`); the browser posts only the role's name. No owner or admin:
 * the sign-in is passwordless, so whoever opens staging would manage SHLTR (its members, their
 * invitations, its settings).
 */
export const demoRoles = ["planner", "engineer", "customer"] as const;
export type DemoRole = (typeof demoRoles)[number];

/** Each role's label, as the message function (read where it's shown). */
export const demoRoleLabels: Record<DemoRole, () => string> = {
	planner: m.auth_demo_planner,
	engineer: m.auth_demo_engineer,
	customer: m.auth_demo_customer,
};
