/**
 * Which customer sites have energy monitoring, and adding it to one: the customer page's card
 * (`slots/customers.detail.side/`) and the sites page (`/energy`) share these. Every member sees a
 * customer's energy sites; only managers add one, which then opens its setup page.
 */
import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { isManager } from "#lib/auth/index.ts";
import { customerCode } from "#lib/schema.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { refuse } from "#lib/server/forms.ts";

import { forManagers, query } from "./remote-functions.ts";
import { createEnergySite as create, customerEnergy, siteChoices } from "./server/setup.ts";
import { newEnergySiteSchema } from "./setup/setup-schema.ts";

/** The customer's sites with their energy sites, and whether the user may add one. */
export const getCustomerEnergy = query(customerCode(), async (code) => ({
	...(await customerEnergy(code)),
	canManage: isManager(currentTenant().roles),
}));

/** The tenant's customer sites without energy monitoring, to add it to one. */
export const getEnergySiteChoices = forManagers.query(() => siteChoices());

/** Adds an energy site for one of the tenant's customer sites, and opens its setup page. */
export const createEnergySite = forManagers.form(newEnergySiteSchema, async (input, issue) => {
	const created = await create(input);
	if ("problems" in created) {
		refuse(issue, created.problems);
		return;
	}
	redirect(303, resolve("/(app)/(modules)/energy/[site]/setup", { site: String(created.id) }));
});
