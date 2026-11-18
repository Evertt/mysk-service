/**
 * Photos added to an order later, as SHLTR's engineer on a phone: the photos card shrinks a photo,
 * sends it, shows it and deletes it again; the unit's page counts the order's photos. And the
 * office's photos card works without JavaScript: the photo goes as it is, unshrunk. Who may add or
 * delete which photo, the limits and isolation are in
 * `src/tests/unit/lib/orders/server/photos-later.spec.ts`.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	mobileViewport,
	newContext,
	organizations,
	rows,
	signInContext,
	useApp,
	users,
} from "./app.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrEngineer, viewport: mobileViewport });

/** A real PNG of 8×4 pixels, which the browser can decode and shrink. */
const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAEUlEQVR4nGM4EaCBFTFQTwIA5M0oATp8j7wAAAAASUVORK5CYII=",
	"base64",
);

/** One of Lev's orders he works on today or later, with a unit: its id, number and unit's serial. */
async function levsOrder() {
	const [found] = await rows<{ id: number; number: string; serial: string }>(
		`select o.id, o.number, e.serial_number as serial from "order" o
		 join engineer en on en.id = o.engineer_id join user u on u.id = en.user_id
		 join order_unit ou on ou.order_id = o.id join equipment e on e.id = ou.equipment_id
		 where u.email = ? and o.organization_id = ? and o.status in ('scheduled', 'on_the_way', 'in_progress')
		 order by o.id limit 1`,
		[users.shltrEngineer, shltr.id],
	);
	return found;
}

const photosOf = (orderId: number) =>
	rows<{ id: number; content_type: string; size: number }>(
		`select id, content_type, size from order_photo where order_id = ? order by position`,
		[orderId],
	);

describe("photos added later", () => {
	test("the engineer adds a shrunk photo on site, sees it, and deletes it", async () => {
		const order = await levsOrder();
		expect(order).toBeDefined();
		const before = (await photosOf(order.id)).length;
		await app.go(`/my/${order.number}`);
		const card = app.page.locator("[data-photos-card]");
		await card
			.locator("[data-photo-picker] input[type=file]")
			.setInputFiles({ name: "plaat.png", mimeType: "image/png", buffer: png });
		await card.getByRole("button", { name: "Remove photo 1" }).waitFor();
		await app.submit(card.getByRole("button", { name: "Upload photos" }));
		await app.toast("Photos added");

		const after = await photosOf(order.id);
		expect(after).toHaveLength(before + 1);
		const added = after.at(-1)!;
		expect(added.content_type).toBe("image/jpeg");
		await card.locator(`[data-order-photo="${added.id}"]`).waitFor();

		// The unit's page counts it with the order.
		await app.go(`/my/equipment/${encodeURIComponent(order.serial)}`);
		expect(
			await app.page
				.locator(`[data-order="${order.number}"] [data-photo-count]`)
				.getAttribute("data-photo-count"),
		).toBe(String(before + 1));

		await app.go(`/my/${order.number}`);
		await card.locator(`[data-delete-photo="${added.id}"]`).click();
		await app.submit(app.page.getByRole("alertdialog").getByRole("button", { name: "Delete" }));
		await app.toast("Photo deleted");
		expect((await photosOf(order.id)).map((photo) => photo.id)).not.toContain(added.id);
		await card.locator(`[data-order-photo="${added.id}"]`).waitFor({ state: "detached" });
	});

	test("without JavaScript, the office adds a photo as it is", async () => {
		const order = await levsOrder();
		const before = (await photosOf(order.id)).length;
		const browser = app.page.context().browser()!;
		const context = await newContext(browser, { javaScriptEnabled: false });
		try {
			await signInContext(context, users.shltrPlanner);
			const page = await context.newPage();
			await page.goto(`${baseURL}/orders/${order.number}`);
			const form = page.locator("[data-add-photos]");
			await form
				.locator("input[type=file]")
				.setInputFiles({ name: "plaat.png", mimeType: "image/png", buffer: png });
			await Promise.all([
				page.waitForLoadState("load"),
				form.getByRole("button", { name: "Upload photos" }).click(),
			]);
			await expect.poll(async () => (await photosOf(order.id)).length).toBe(before + 1);
			// Not shrunk: the PNG as it was chosen.
			expect((await photosOf(order.id)).at(-1)).toMatchObject({
				content_type: "image/png",
				size: png.byteLength,
			});
		} finally {
			await context.close();
		}
	});
});
