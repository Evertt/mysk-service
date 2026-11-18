/**
 * Reporting a breakdown with a photo and a kind of fault in the customer portal, as Riedel's
 * contact on a phone: the form shrinks the photo, the order's page shows it and the fault, and the
 * office's order page too. The server's rules (the limits, who may see a photo, isolation) are in
 * `src/tests/unit/lib/orders/server/photos.spec.ts`.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { baseURL, mobileViewport, organizations, rows, useApp, users } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.riedel, viewport: mobileViewport });

/** A real PNG of 8×4 pixels, which the browser can decode and shrink. */
const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAEUlEQVR4nGM4EaCBFTFQTwIA5M0oATp8j7wAAAAASUVORK5CYII=",
	"base64",
);

/** Whether every photo on `page` has loaded, through `/photos/<id>`. */
const photosLoaded = (page: Page) =>
	page
		.locator("[data-order-photo]")
		.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0));

describe("reporting a breakdown with a photo", () => {
	test("sends the fault and the shrunk photo, and the order's page shows them", async () => {
		await app.go("/portal/report");
		const unit = app.page.getByLabel("Unit");
		const [choice] = await unit
			.locator("option:not([value=''])")
			.evaluateAll((options) =>
				options.slice(0, 1).map((option) => (option as HTMLOptionElement).value),
			);
		await unit.selectOption(choice);
		await app.page.getByRole("button", { name: "Door won't close" }).click();
		await app.page.getByLabel("Description").fill("De roldeur van dock 2 sluit niet.");
		// The top urgency reads as a standstill in the portal.
		await app.page
			.getByRole("group", { name: "Urgency" })
			.getByRole("button", { name: "Standstill" })
			.click();
		await app.page
			.locator("[data-photo-picker] input[type=file]")
			.setInputFiles({ name: "deur.png", mimeType: "image/png", buffer: png });
		// Shrunk into a JPEG thumbnail before it's sent.
		await app.page.getByRole("button", { name: "Remove photo 1" }).waitFor();
		await app.page.getByRole("button", { name: "Send report" }).click();
		await app.page.waitForURL((url) => url.pathname.startsWith("/portal/orders/"));
		await app.page.locator("[data-reported]").waitFor();

		const [created] = await rows<{
			id: number;
			number: string;
			priority: string;
			fault: string;
		}>(
			`select o.id, o.number, o.priority, r.fault from "order" o
			 join order_request r on r.order_id = o.id
			 where o.organization_id = ? order by o.id desc limit 1`,
			[shltr.id],
		);
		expect(created).toMatchObject({ priority: "urgent", fault: "door_wont_close" });
		const photos = await rows<{ content_type: string; object_key: string }>(
			`select content_type, object_key from order_photo where order_id = ?`,
			[created.id],
		);
		expect(photos).toHaveLength(1);
		expect(photos[0].content_type).toBe("image/jpeg");
		expect(photos[0].object_key.startsWith(`${shltr.id}/orders/`)).toBe(true);

		const report = app.page.locator("[data-report]");
		expect(await report.locator("[data-report-fault]").innerText()).toContain("Door won't close");
		await expect.poll(() => photosLoaded(app.page)).toBe(true);
		expect(await app.page.locator("[data-order-details]").innerText()).toContain("Standstill");

		// The office reads the same report, with the photo.
		const { page: office } = await signedInPage(app, users.shltrPlanner);
		try {
			await office.goto(`${baseURL}/orders/${created.number}`);
			const card = office.locator("[data-acceptance]");
			await card.waitFor();
			expect(await card.locator("[data-report-fault]").innerText()).toContain("Door won't close");
			await expect.poll(() => photosLoaded(office)).toBe(true);
		} finally {
			await office.context().close();
		}
	});
});
