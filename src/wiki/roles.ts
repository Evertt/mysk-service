/**
 * The SHLTR demo's roles (`demoRoles`) as the wiki names them, in English like the rest of the
 * wiki: the app's labels (`demoRoleLabels`) are Paraglide's, so in Dutch they'd read Dutch inside
 * an English page.
 */
import type { DemoRole } from "#routes/demo-roles.ts";

export const roleNames: Record<DemoRole, string> = {
	planner: "planner",
	engineer: "field engineer",
	customer: "customer contact",
};
