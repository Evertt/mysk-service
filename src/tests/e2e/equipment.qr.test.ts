import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";

import {
	BROWSER_OPTIONS,
	baseURL,
	hydrated,
	organizations,
	quiet,
	rows,
	useApp,
	users,
	value,
} from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";

const { north, south } = organizations;
const app = useApp();

/** A North unit on an open order of the North field engineer's, with its code's token. */
const engineersUnit = async () => {
	const [found] = await rows<{ serial: string; token: string; number: string }>(
		`select e.serial_number as serial, e.qr_token as token, o.number from equipment e
		 join order_unit ou on ou.equipment_id = e.id join "order" o on o.id = ou.order_id
		 join engineer g on g.id = o.engineer_id join user u on u.id = g.user_id
		 where e.organization_id = ? and u.email = ? and o.status in ('scheduled', 'in_progress')
		 order by o.scheduled_for, o.id limit 1`,
		[north.id, users.engineer],
	);
	return found;
};

/** A North location with units, and its code's token. */
const northLocation = async () => {
	const [found] = await rows<{ id: number; name: string; token: string }>(
		`select l.id, l.name, l.qr_token as token from equipment_location l where organization_id = ?
		 and exists (select 1 from equipment e where e.location_id = l.id) order by l.id limit 1`,
		[north.id],
	);
	return found;
};

/** Opens `/q/<token>` and waits for where it leads. */
async function scan(page: Page, token: string) {
	const response = await page.goto(`${baseURL}/q/${token}`);
	await hydrated(page);
	return {
		status: response?.status(),
		path: new URL(page.url()).pathname,
		url: new URL(page.url()),
	};
}

/** A page in a browser context of its own, signed out. Close its context when done. */
async function signedOutPage() {
	const context = await app.page
		.context()
		.browser()!
		.newContext({
			viewport: { width: 1440, height: 1000 },
			...BROWSER_OPTIONS,
		});
	return context.newPage();
}

/** Signs in on the login page the page is on. */
async function signIn(page: Page, email: string) {
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(DEMO_PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL((url) => url.pathname !== "/login");
	await quiet(page);
}

describe("a unit's or location's QR code", () => {
	test("leads someone of the office to its page", async () => {
		const unit = await engineersUnit();
		expect(await scan(app.page, unit.token)).toMatchObject({
			status: 200,
			path: `/equipment/${unit.serial}`,
		});
		const location = await northLocation();
		expect(await scan(app.page, location.token)).toMatchObject({
			path: `/equipment/locations/${location.id}`,
		});
		await app.page.getByRole("heading", { name: location.name }).waitFor();
	});

	test("an unknown one is a 404", async () => {
		expect((await scan(app.page, "0123456789abcdef01234567")).status).toBe(404);
		expect((await scan(app.page, "not-a-token")).status).toBe(404);
	});

	test("leads a field engineer to the unit in their portal, with their open orders on it", async () => {
		const unit = await engineersUnit();
		const { page } = await signedInPage(app, users.engineer);
		try {
			expect(await scan(page, unit.token)).toMatchObject({
				status: 200,
				path: `/my/equipment/${unit.serial}`,
			});
			await page.locator(`[data-order="${unit.number}"]`).waitFor();
			expect(await page.getByText("Your open orders here").count()).toBe(1);

			// A location: its units, and the engineer's orders on them.
			const location = await northLocation();
			expect(await scan(page, location.token)).toMatchObject({
				path: `/my/locations/${location.id}`,
			});
			await page.getByRole("heading", { name: location.name }).waitFor();
			const serials = await rows<{ serial_number: string }>(
				`select serial_number from equipment where location_id = ?`,
				[location.id],
			);
			const shown = await page.locator("main").innerText();
			for (const each of serials) expect(shown).toContain(each.serial_number);
		} finally {
			await page.context().close();
		}
	});

	test("sends someone signed out to the login, and on to it after", async () => {
		const unit = await engineersUnit();
		const page = await signedOutPage();
		try {
			const scanned = await scan(page, unit.token);
			expect(scanned.path).toBe("/login");
			expect(scanned.url.searchParams.get("redirectTo")).toBe(`/q/${unit.token}`);
			await signIn(page, users.planner);
			expect(new URL(page.url()).pathname).toBe(`/equipment/${unit.serial}`);
		} finally {
			await page.context().close();
		}
		// A field engineer goes on to their portal.
		const field = await signedOutPage();
		try {
			await scan(field, unit.token);
			await signIn(field, users.engineer);
			expect(new URL(field.url()).pathname).toBe(`/my/equipment/${unit.serial}`);
		} finally {
			await field.context().close();
		}
	});

	test("of another tenant is a 404 for who isn't a member there", async () => {
		const unit = await engineersUnit();
		const location = await northLocation();
		const { page } = await signedInPage(app, users.shltrPlanner);
		try {
			expect((await scan(page, unit.token)).status).toBe(404);
			expect((await scan(page, location.token)).status).toBe(404);
			// Their own tenant's still lead to them.
			const own = await value<string>(
				`select qr_token from equipment where organization_id = ? order by id limit 1`,
				[organizations.shltr.id],
			);
			expect((await scan(page, own)).path).toMatch(/^\/equipment\//);
		} finally {
			await page.context().close();
		}
	});

	test("of another of the user's organizations switches to it", async () => {
		await app.go("/");
		await app.switchOrganization(south.name);
		const unit = await engineersUnit();
		expect(await scan(app.page, unit.token)).toMatchObject({
			status: 200,
			path: `/equipment/${unit.serial}`,
		});
		// North is the current organization now.
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(north.name);
	});
});
