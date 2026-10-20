/**
 * Which customer sites have energy monitoring, and adding it to one: the customer page's card
 * (`slots/customers.detail.side/`) and the sites page (`/energy`) share these. Every member sees a
 * customer's energy sites; only managers add one, which then opens its setup page.
 */
import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { customerCode } from "#lib/schema.ts";

import { forManagers, query } from "./remote-functions.ts";
import { createEnergySite as create, customerEnergy, siteChoices } from "./server/setup.ts";
import { newEnergySiteSchema } from "./setup/setup-schema.ts";

/** The customer's sites with their energy sites. */
export const getCustomerEnergy = query(customerCode(), (code) => customerEnergy(code));

/** The tenant's customer sites without energy monitoring, to add it to one. */
export const getEnergySiteChoices = forManagers.query(() => siteChoices());

/** Adds an energy site for one of the tenant's customer sites, and opens its setup page. */
export const createEnergySite = forManagers.form(newEnergySiteSchema, async (input) => {
	const created = await create(input);
	redirect(303, resolve("/(app)/(modules)/energy/[site]/setup", { site: String(created.id) }));
});
