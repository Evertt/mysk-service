/**
 * The SHLTR demo's roles, in their order on the login page's buttons and in the user menus' "View
 * as" (`view-as.svelte`), with their labels. Which account each is, and the checks, are the
 * server's (`demo-accounts.server.ts`); the browser posts only the role's name.
 */
export const demoRoles = ["admin", "engineer", "customer"] as const;
export type DemoRole = (typeof demoRoles)[number];

/** Each role's label, as the message function (read where it's shown). */
export const demoRoleLabels: Record<DemoRole, () => string> = {
	admin: m.auth_demo_admin,
	engineer: m.auth_demo_engineer,
	customer: m.auth_demo_customer,
};
