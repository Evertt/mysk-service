/**
 * Deleting a customer's site that has docks (`server/site-removal.ts`, at core's
 * `customers.removingSite`) on the seeded demo database: the sites card's delete is refused with
 * how many docks are there, the site and its docks stay, and nothing is logged, also while SHLTR
 * has the docks off; once the docks are gone the site can go.
 */
import { describe, expect, test } from "vite-plus/test";

import { deleteCustomerSite } from "#lib/customers/detail/sites.remote.ts";
import {
	as,
	organizationId,
	rows,
	shltr,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

/** A new site, without equipment, for the SHLTR customer with docks; its id. */
async function emptySite() {
	const [{ customer }] = await rows<{ customer: number }>(
		`select s.customer_id as customer from dock_position d
		 join customer_site s on s.id = d.site_id where d.organization_id = ? limit 1`,
		[shltrId],
	);
	const [{ id }] = await rows<{ id: number }>(
		`insert into customer_site (organization_id, customer_id, name, city, country)
		 values (?, ?, 'Laadperron zuid', 'Ede', 'Netherlands') returning id`,
		[shltrId, customer],
	);
	return id;
}

const deleteSite = (site: number) =>
	as(shltr.owner, () => submit(deleteCustomerSite, { id: String(site) }));

const docksAt = (site: number) =>
	value<number>(`select count(*) from dock_position where site_id = ?`, [site]);

const logged = (site: number) =>
	value<number>(
		`select count(*) from activity where organization_id = ? and subject_type = 'site' and subject_id = ?`,
		[shltrId, String(site)],
	);

describe("deleting a site with docks", () => {
	test("is refused with how many docks are there, and keeps the site and its docks", async () => {
		const site = await emptySite();
		await rows(
			`insert into dock_position (organization_id, site_id, code) values (?, ?, 'DOCK 91'), (?, ?, 'DOCK 92')`,
			[shltrId, site, shltrId, site],
		);
		expect(await deleteSite(site)).toMatchObject({
			status: 400,
			issues: [{ message: "This site has 2 docks. Delete them on the Docks card first." }],
		});
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(1);
		expect(await docksAt(site)).toBe(2);
		expect(await logged(site)).toBe(0);
	});

	test("is refused while the docks are off too, saying to switch them on", async () => {
		const site = await emptySite();
		await rows(
			`insert into dock_position (organization_id, site_id, code) values (?, ?, 'DOCK 94'), (?, ?, 'DOCK 95')`,
			[shltrId, site, shltrId, site],
		);
		expect(await withoutModule("shltr", "docks", () => deleteSite(site))).toMatchObject({
			status: 400,
			issues: [
				{
					message:
						"This site still has 2 docks. Switch Docks on and delete them on the Docks card first.",
				},
			],
		});
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(1);
		expect(await docksAt(site)).toBe(2);
		expect(await logged(site)).toBe(0);
	});

	test("goes once its docks are gone", async () => {
		const site = await emptySite();
		await rows(
			`insert into dock_position (organization_id, site_id, code) values (?, ?, 'DOCK 93')`,
			[shltrId, site],
		);
		expect(await deleteSite(site)).toMatchObject({
			status: 400,
			issues: [{ message: "This site has 1 dock. Delete it on the Docks card first." }],
		});
		await rows(`delete from dock_position where site_id = ?`, [site]);
		expect(await deleteSite(site)).toMatchObject({
			status: 200,
		});
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(0);
		expect(await logged(site)).toBe(1);
	});
});
