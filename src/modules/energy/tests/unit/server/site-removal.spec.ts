/**
 * Deleting a customer's site whose energy is monitored (`server/site-removal.ts`, at core's
 * `customers.removingSite`) on the seeded demo database: the sites card's delete is refused,
 * naming the energy site (or, while SHLTR has energy off, saying to switch it on), and the site
 * keeps its energy site and readings, unlogged; once the
 * energy site is gone the site can go. Riedel's seeded site (with its months of readings) also has
 * equipment, which core refuses first, so these use a site of their own.
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

/** A new site of the customer whose energy SHLTR monitors, without equipment, monitored too; its id. */
async function monitoredSite(name: string) {
	const [{ customer }] = await rows<{ customer: number }>(
		`select s.customer_id as customer from energy_site e
		 join customer_site s on s.id = e.site_id where e.organization_id = ? limit 1`,
		[shltrId],
	);
	const [{ id }] = await rows<{ id: number }>(
		`insert into customer_site (organization_id, customer_id, name, city, country)
		 values (?, ?, 'Distributiecentrum', 'Ede', 'Netherlands') returning id`,
		[shltrId, customer],
	);
	await rows(
		`insert into energy_site (organization_id, site_id, name, meter_name, contracted_peak_kw, contracted_kwh_per_year)
		 values (?, ?, ?, 'Hoofdaansluiting', 250, 900000)`,
		[shltrId, id, name],
	);
	return id;
}

const deleteSite = (site: number) =>
	as(shltr.owner, () => submit(deleteCustomerSite, { id: String(site) }));

describe("deleting a site whose energy is monitored", () => {
	test("is refused, naming its energy site, and keeps the site and its energy site", async () => {
		const site = await monitoredSite("Riedel Ede — Distributiecentrum");
		expect(await deleteSite(site)).toMatchObject({
			status: 400,
			issues: [
				{
					message:
						"This site's energy is monitored as Riedel Ede — Distributiecentrum. Delete that energy site first.",
				},
			],
		});
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(1);
		expect(await value(`select count(*) from energy_site where site_id = ?`, [site])).toBe(1);
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and subject_type = 'site' and subject_id = ?`,
				[shltrId, String(site)],
			),
		).toBe(0);
	});

	test("is refused while energy is off too, saying to switch it on", async () => {
		const site = await monitoredSite("Riedel Ede — Cross-dock");
		expect(await withoutModule("shltr", "energy", () => deleteSite(site))).toMatchObject({
			status: 400,
			issues: [
				{
					message:
						"This site still has energy data. Switch Energy on and delete its energy site first.",
				},
			],
		});
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(1);
		expect(await value(`select count(*) from energy_site where site_id = ?`, [site])).toBe(1);
	});

	test("goes once its energy site is gone", async () => {
		const site = await monitoredSite("Riedel Ede — Expeditie");
		expect(await deleteSite(site)).toMatchObject({ status: 400 });
		await rows(`delete from energy_site where site_id = ?`, [site]);
		expect(await deleteSite(site)).toMatchObject({ status: 200 });
		expect(await value(`select count(*) from customer_site where id = ?`, [site])).toBe(0);
	});
});
