/**
 * A customer's sites, changed from the sites card on the customer's page. Each refreshes the
 * customer's page, which lists them (`getCustomer`).
 */
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { refuse } from "#lib/server/forms.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { getCustomer } from "../customers.remote.ts";
import { newSiteSchema, siteSchema } from "../form/site-schema.ts";
import { countryProblems } from "../server/countries.ts";
import { createSite, removeSite, updateSite } from "../server/sites.ts";

export const addCustomerSite = forMembers.form(
	newSiteSchema,
	async ({ customerId, ...input }, issue) => {
		refuse(issue, await countryProblems(input.country));
		const code = await createSite(customerId, input);
		void getCustomer(code).refresh();
	},
);

export const updateCustomerSite = forMembers.form(siteSchema, async ({ id, ...input }, issue) => {
	refuse(issue, await countryProblems(input.country));
	const code = await updateSite(id, input);
	void getCustomer(code).refresh();
});

export const deleteCustomerSite = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	const code = await removeSite(id);
	void getCustomer(code).refresh();
});
