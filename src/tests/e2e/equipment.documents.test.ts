/**
 * A unit's manuals and documents across the shells: SHLTR's planner uploads one on the unit's page,
 * its engineer finds it on the unit in the engineer portal, and Riedel's contact opens it from the
 * unit's page in the customer portal on a phone; another customer's contact gets a 404. What the
 * server takes, who reads which document and the clean-up are
 * `src/tests/unit/lib/equipment/server/documents.spec.ts`'s.
 */
import type { Page } from "playwright";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { demoPdf } from "#lib/server/db/seed/documents.ts";

import { baseURL, mobileViewport, organizations, rows, useApp, users, value } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrPlanner });

/** SHLTR's Sectionaaldeur D-07 at Riedel, which the seed gives a manual and a CE declaration. */
let serial: string;

beforeAll(async () => {
	serial = await value<string>(
		`select serial_number from equipment where organization_id = ? and name = ?`,
		[shltr.id, "Sectionaaldeur laaddok 07"],
	);
});

const title = "Bedradingsschema SD 4000";

/** The link of the document `title` on `page`, and what `/documents/<id>` answers it. */
async function opened(page: Page, documentTitle: string) {
	const link = page.locator("[data-document]", { hasText: documentTitle }).getByRole("link");
	// The link's path, which a page the server rendered writes relative to its own.
	const href = await link.evaluate((anchor) => (anchor as HTMLAnchorElement).pathname);
	expect(href).toMatch(/^\/documents\/\d+$/);
	const response = await page.request.get(`${baseURL}${href}`);
	return { link, href, response };
}

describe("a unit's documents", () => {
	test("the office uploads one on the unit's page, and it's listed by its kind", async () => {
		await app.go(`/equipment/${serial}`);
		const card = app.page.locator("[data-documents-card]");
		// The seed's two, by kind.
		await expect.poll(() => card.locator("[data-document]").count()).toBe(2);
		const form = card.locator("[data-add-document]");
		await form.getByLabel("Title").fill(title);
		await form.getByLabel("Kind").selectOption("drawing");
		await form.locator("input[type=file]").setInputFiles({
			name: "bedrading.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(demoPdf(["Bedradingsschema", "Crawford SD 4000"])),
		});
		await app.submit(form.getByRole("button", { name: "Upload" }));
		await app.toast("Document added");
		const drawings = card.locator("section", { hasText: "Drawing" });
		await drawings.locator("[data-document]", { hasText: title }).waitFor();

		const [row] = await rows<{ kind: string; content_type: string; filename: string }>(
			`select kind, content_type, filename from equipment_document where title = ?`,
			[title],
		);
		expect(row).toEqual({
			kind: "drawing",
			content_type: "application/pdf",
			filename: "bedrading.pdf",
		});
		const { response } = await opened(app.page, title);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-disposition"]).toContain("inline");
	});

	test("its engineer opens it on the unit in the engineer portal", async () => {
		const { page } = await signedInPage(app, users.shltrEngineer);
		try {
			await page.goto(`${baseURL}/my/equipment/${serial}`);
			const documents = page.locator("[data-unit-documents]");
			await documents.locator("[data-document]", { hasText: title }).waitFor();
			const { link, response } = await opened(page, title);
			// A PDF opens in a tab of its own.
			expect(await link.getAttribute("target")).toBe("_blank");
			expect(response.status()).toBe(200);
			expect(response.headers()["content-type"]).toBe("application/pdf");
			// The seed's manual's file is there too.
			const manual = await opened(page, "Gebruikershandleiding Crawford SD 4000");
			expect(manual.response.status()).toBe(200);
		} finally {
			await page.context().close();
		}
	});

	test("the customer's contact opens it from the unit's page; another customer's can't", async () => {
		await app.page.setViewportSize(mobileViewport);
		await app.signIn(users.riedel);
		await app.go(`/portal/equipment/${serial}`);
		const link = app.page.locator('[data-unit-link="documents"]');
		expect(await link.locator("[data-unit-documents-count]").innerText()).toBe("3");
		await link.click();
		await app.page.waitForURL((url) => url.pathname === `/portal/equipment/${serial}/documents`);
		await app.page.getByRole("heading", { name: "Manuals & documents" }).waitFor();
		const { href, response } = await opened(app.page, title);
		expect(response.status()).toBe(200);

		const { page } = await signedInPage(app, users.weggemans);
		try {
			expect((await page.request.get(`${baseURL}${href}`)).status()).toBe(404);
		} finally {
			await page.context().close();
		}
	});
});
