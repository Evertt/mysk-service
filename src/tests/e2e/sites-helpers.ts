/**
 * What the sites overview's and site report's tests share, in the office
 * (`customers.overview.test.ts`) and the customer portal (`client.sites.test.ts`).
 */
import type { Page } from "playwright";

import { hydrated, organizations, rows, value } from "./app.ts";

const { shltr } = organizations;

/** A SHLTR customer's code and its sites' ids, by the customer's name. */
export async function customerSites(name: string) {
	const sites = await rows<{ id: number; code: string }>(
		`select s.id, c.code from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = ? order by s.id`,
		[shltr.id, name],
	);
	return { code: sites[0].code, siteIds: sites.map((site) => site.id) };
}

/** The open faults at a site as the database has them: reports and breakdowns still to be done. */
export const openFaultsAt = (siteId: number) =>
	value<number>(
		`select count(*) from "order" o where o.organization_id = ? and exists (select 1 from
		 order_unit ou join equipment e on e.id = ou.equipment_id where ou.order_id = o.id and
		 e.site_id = ?) and (o.status = 'awaiting_acceptance' or (o.type = 'breakdown' and
		 o.status in ('quote', 'scheduled', 'on_the_way', 'in_progress')))`,
		[shltr.id, siteId],
	);

/** The value a site's card shows on its chip `id` (e.g. `core.openFaults`), 0 without the chip. */
export async function chipValue(page: Page, siteId: number, id: string) {
	const chip = page.locator(`[data-site-card="${siteId}"] [data-figure="${id}"]`);
	if (!(await chip.count())) return 0;
	return Number((await chip.locator("span").first().textContent())!.replace(/\D/g, ""));
}

/** Reports a breakdown of the contact's first unit in the portal, on `page`. */
export async function reportBreakdown(page: Page, description: string) {
	await hydrated(page);
	const unit = page.getByLabel("Unit");
	const [choice] = await unit
		.locator("option:not([value=''])")
		.evaluateAll((options) =>
			options.slice(0, 1).map((option) => (option as HTMLOptionElement).value),
		);
	await unit.selectOption(choice);
	await page.getByLabel("Description").fill(description);
	await page
		.getByRole("group", { name: "Urgency" })
		.getByRole("button", { name: "Standstill" })
		.click();
	await page.getByRole("button", { name: "Send report" }).click();
	await page.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
}

/** Marks the page, which is gone if it reloads. */
export const mark = (page: Page) =>
	page.evaluate(() => Object.assign(window, { sitesMarker: true }));
export const notReloaded = (page: Page) => page.evaluate(() => "sitesMarker" in window);
