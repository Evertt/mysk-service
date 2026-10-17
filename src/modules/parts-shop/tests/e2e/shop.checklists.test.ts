/**
 * The parts shop's link to the checklists: a rejected point whose template point a product fixes
 * suggests that product, on the office's order page with "Add to order" (a material line on the
 * order), and in the customer portal with "Order in the shop" for a partner with credit.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

/** A SHLTR order (of `customer`, if given) with a rejected point that an orderable product fixes. */
async function orderWithSuggestion(where: string, args: (string | number)[] = []) {
	const [found] = await rows<{
		id: number;
		number: string;
		sku: string;
		material_id: number;
	}>(
		`select o.id, o.number, m.sku, m.id as material_id
		 from checklist_result r
		 join checklist c on c.id = r.checklist_id
		 join "order" o on o.id = c.order_id
		 join customer cu on cu.id = o.customer_id
		 join checklist_template_item i on i.template_id = c.template_id and i.text = r.text
		   and i.group_name = r.group_name
		 join shop_product_checkpoint pc on pc.template_item_id = i.id
		 join shop_product p on p.id = pc.product_id and p.on_request = 0
		 join material m on m.id = p.material_id and m.stock > 0
		 where r.result = 'nok' and r.organization_id = ? and ${where}
		 order by o.id, m.sku limit 1`,
		[shltr.id, ...args],
	);
	return found;
}

describe("a checklist's rejected point", () => {
	test("suggests the part it needs on the order's page, which adds it to the order", async () => {
		const { page } = app;
		const order = await orderWithSuggestion(`o.status = 'completed'`);
		expect(order).toBeDefined();
		const lineOf = async () =>
			(
				await rows<{ quantity: number }>(
					`select quantity from order_line where order_id = ? and material_id = ?`,
					[order.id, order.material_id],
				)
			)[0]?.quantity ?? 0;
		const before = await lineOf();
		await app.go(`/orders/${order.number}`);
		const part = page.locator(`[data-suggested-parts] [data-suggested-part="${order.sku}"]`);
		await part.waitFor();
		expect(await page.locator("[data-suggested-parts]").innerText()).toContain("Part needed");
		await app.submit(part.getByRole("button", { name: "Add to order" }));
		await expect.poll(lineOf).toBe(before + 1);
	});

	test("can't be added to an invoiced order", async () => {
		const { page } = app;
		const order = await orderWithSuggestion(`o.status = 'invoiced'`);
		await app.go(`/orders/${order.number}`);
		await page.locator(`[data-suggested-part="${order.sku}"]`).waitFor();
		expect(await page.locator("[data-suggested-parts]").getByRole("button").count()).toBe(0);
	});

	test("is to order in the shop in the customer portal, for a partner with credit", async () => {
		const order = await orderWithSuggestion(`cu.name = 'Riedel B.V.'`);
		const { page } = await signedInPage(app, users.riedel);
		try {
			await page.goto(new URL(`/portal/orders/${order.number}`, page.url()).href);
			const part = page.locator(
				`[data-client-suggested-parts] [data-suggested-part="${order.sku}"]`,
			);
			await part.waitFor();
			await part.getByRole("link", { name: "Order in the shop" }).click();
			await page.waitForURL((url) => url.pathname === "/parts-shop/portal");
			const line = page.locator(`[data-checkout] [data-cart-line="${order.sku}"]`);
			await line.waitFor();
			expect(await page.locator("[data-checkout] [data-cart-line]").count()).toBe(1);
		} finally {
			await page.context().close();
		}
	});
});
