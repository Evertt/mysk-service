/**
 * For a server spec of something a customer's contact reads of a unit by its serial number: makes
 * Riedel's contact (`shltr.customer`) the contact of a SHLTR customer with units at two sites,
 * limited to the first, and checks that `ask` answers a unit at the first and is a 404 for one at
 * the second. Changes the spec file's database, so call it last.
 */
import { expect } from "vite-plus/test";

import { organizationId, rows, shltr, value } from "./harness/index.ts";

export async function expectSiteLimited(
	ask: (serialNumber: string) => Promise<{ status: number }>,
) {
	const shltrId = organizationId("shltr");
	const [pair] = await rows<{ customerId: number; first: number; second: number }>(
		`select customer_id as customerId, min(site_id) as first, max(site_id) as second
		 from equipment where organization_id = ? group by customer_id
		 having count(distinct site_id) > 1 order by customer_id limit 1`,
		[shltrId],
	);
	expect(pair, "a SHLTR customer has units at two sites").toBeDefined();
	const contact = await value<number>(
		`select p.id from portal_contact p join user u on u.id = p.user_id
		 where u.email = ? and p.organization_id = ?`,
		[shltr.customer.email, shltrId],
	);
	await rows(`delete from portal_contact_site where contact_id = ?`, [contact]);
	await rows(`update portal_contact set customer_id = ?, all_sites = 0 where id = ?`, [
		pair.customerId,
		contact,
	]);
	await rows(
		`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
		 values (?, ?, ?, ?)`,
		[shltrId, contact, pair.customerId, pair.first],
	);
	const serialAt = (siteId: number) =>
		value<string>(
			`select serial_number from equipment where customer_id = ? and site_id = ? order by id limit 1`,
			[pair.customerId, siteId],
		);
	expect(await ask(await serialAt(pair.first))).toMatchObject({ status: 200 });
	expect(await ask(await serialAt(pair.second))).toMatchObject({ status: 404 });
}
