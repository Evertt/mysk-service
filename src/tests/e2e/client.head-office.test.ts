/**
 * The demo's head office in the customer portal, on a phone: Distributiecentrum Zutphen's contact
 * sees all three of its sites, and the sites overview tells the seed's story
 * (`src/lib/server/db/seed/head-office.ts`): Zutphen first, needing attention with its open
 * faults; an engineer on the way to Deventer, which needs nothing else; Culemborg all fine.
 */
import { expect, test } from "vite-plus/test";

import { HEAD_OFFICE } from "#lib/server/db/demo.ts";

import { fitsWidth, mobileViewport, organizations, rows, useApp, users } from "./app.ts";
import { chipValue, openFaultsAt } from "./sites-helpers.ts";

const app = useApp({ user: users.headOffice, viewport: mobileViewport });

test("the sites overview tells the head office's story", async () => {
	const { page } = app;
	const sites = await rows<{ id: number; name: string }>(
		`select s.id, s.name from customer_site s join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = ? order by s.id`,
		[organizations.shltr.id, HEAD_OFFICE.customer],
	);
	const id = (name: string) => sites.find((site) => site.name === name)!.id;
	const card = (name: string) => page.locator(`[data-site-card="${id(name)}"]`);

	await app.go("/portal/sites");
	await page.locator("[data-site-card]").first().waitFor();
	const shown = await page
		.locator("[data-site-card]")
		.evaluateAll((all) => all.map((each) => Number(each.getAttribute("data-site-card"))));
	expect(shown.toSorted((a, b) => a - b)).toEqual(sites.map((site) => site.id));

	// Zutphen first, needing attention, with the faults open there (hers among them).
	expect(shown[0]).toBe(id("Zutphen"));
	expect(await card("Zutphen").getAttribute("data-attention")).toBe("true");
	const faults = await chipValue(page, id("Zutphen"), "core.openFaults");
	expect(faults).toBe(await openFaultsAt(id("Zutphen")));
	expect(faults).toBeGreaterThan(0);
	// An engineer on the way to Deventer, which needs nothing else.
	expect(await chipValue(page, id("Deventer"), "core.onTheWay")).toBe(1);
	expect(await card("Deventer").getAttribute("data-attention")).toBe("false");
	// Culemborg all fine: no chips at all.
	expect(await card("Culemborg").getAttribute("data-attention")).toBe("false");
	expect(await card("Culemborg").locator("[data-figure]").count()).toBe(0);
	expect(await fitsWidth(page)).toBe(true);
});
