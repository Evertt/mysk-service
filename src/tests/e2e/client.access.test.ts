/**
 * Portal access, on a customer's page: an owner invites a contact of the customer for some of its
 * sites, who creates their account from the mail and then sees only those sites in the customer
 * portal; revoking takes the access away. Logged on the customer. What the invitation refuses, a
 * planner's part and the members page without the contacts are
 * `customers/server/portal-access.spec.ts`'s.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import {
	BROWSER_OPTIONS,
	baseURL,
	hydrated,
	linkInMail,
	organizations,
	quiet,
	rows,
	sentMail,
	useApp,
	users,
	value,
} from "./app.ts";

const { shltr } = organizations;
const app = useApp({ user: users.shltrOwner });

const contact = {
	email: "k.smit@vermeerlogistiek.example",
	name: "Karin Smit",
	password: "deventer-dock-7",
};

/** Vermeer's code, and its sites by name. */
const vermeer = async () => {
	const sites = await rows<{ id: number; name: string; customer_code: string }>(
		`select s.id, s.name, c.code as customer_code from customer_site s
		 join customer c on c.id = s.customer_id
		 where c.organization_id = ? and c.name = 'Vermeer Logistiek' order by s.id`,
		[shltr.id],
	);
	return { code: sites[0].customer_code, sites };
};

/** The contact's portal access as stored. */
const access = () =>
	rows<{ id: number; user_id: string | null; invitation_id: string | null; all_sites: number }>(
		`select id, user_id, invitation_id, all_sites from portal_contact where email = ?`,
		[contact.email],
	);

let contactsPage: Page;

describe("portal access", () => {
	test("an owner invites a contact of the customer, for one of its sites", async () => {
		const { code, sites } = await vermeer();
		await app.go(`/customers/${code}`);
		const card = app.page.locator("[data-portal-access]");
		await card.getByLabel("Invite a contact by email").fill(contact.email);
		await card.getByLabel("Distributiecentrum Deventer").check();
		await app.submit(card.getByRole("button", { name: "Send invitation" }));
		await card.locator(`[data-portal-contact="${contact.email}"]`).waitFor();
		expect(await card.locator(`[data-portal-contact="${contact.email}"]`).innerText()).toContain(
			"Invited",
		);

		const [stored] = await access();
		expect(stored).toMatchObject({ user_id: null, all_sites: 0 });
		expect(
			await rows(`select site_id from portal_contact_site where contact_id = ?`, [stored.id]),
		).toEqual([{ site_id: sites.find((site) => site.name === "Distributiecentrum Deventer")!.id }]);
		expect(await value(`select role from invitation where id = ?`, [stored.invitation_id])).toBe(
			"customer",
		);
		expect(linkInMail(contact.email)).toBe(`${baseURL}/invite/${stored.invitation_id}`);
		expect(sentMail(contact.email).at(-1)!.text).toContain("a customer contact");
	});

	test("the contact creates their account and sees only their sites in the portal", async () => {
		const context = await app.page
			.context()
			.browser()!
			.newContext({ ...BROWSER_OPTIONS });
		contactsPage = await context.newPage();
		const page = contactsPage;
		await page.goto(linkInMail(contact.email));
		await hydrated(page);
		await page.getByLabel("Your name").fill(contact.name);
		await page.getByLabel("Password", { exact: true }).fill(contact.password);
		await page.getByLabel("Repeat the password").fill(contact.password);
		await page.getByRole("button", { name: "Create account and join" }).click();
		await page.waitForURL((url) => url.pathname === "/portal");
		await quiet(page);
		expect(await page.locator("header").innerText()).toContain("Vermeer Logistiek");
		expect((await access())[0]).toMatchObject({ invitation_id: null });
		expect((await access())[0].user_id).not.toBeNull();

		await page.goto(`${baseURL}/portal/equipment`);
		await hydrated(page);
		const { sites } = await vermeer();
		const units = (site: string) =>
			rows<{ serial_number: string }>(`select serial_number from equipment where site_id = ?`, [
				sites.find((each) => each.name === site)!.id,
			]);
		const shown = await page
			.locator("main [data-unit]")
			.evaluateAll((links) => links.map((link) => link.getAttribute("data-unit") ?? ""));
		const deventer = await units("Distributiecentrum Deventer");
		expect(shown.toSorted()).toEqual(deventer.map((unit) => unit.serial_number).toSorted());
		// A unit at the site they don't see is a 404, as another customer's is.
		const [apeldoorn] = await units("Apeldoorn");
		const response = await page.goto(`${baseURL}/portal/equipment/${apeldoorn.serial_number}`);
		expect(response?.status()).toBe(404);
	});

	test("the office sees that they have access, and the log has it on the customer", async () => {
		const { code } = await vermeer();
		await app.go(`/customers/${code}`);
		const row = app.page.locator(`[data-portal-contact="${contact.email}"]`);
		await expect.poll(() => row.innerText()).toContain("Has access");
		expect(await row.innerText()).toContain(contact.name);
		expect(await row.innerText()).toContain("Sites: Distributiecentrum Deventer");
		const logged = await rows<{ action: string; subject_type: string; user_name: string }>(
			`select action, subject_type, user_name from activity where parent_type = 'customer'
			 and parent_label = ? and subject_type in ('invitation', 'portal_contact') order by id`,
			[code],
		);
		expect(logged).toEqual([
			{ action: "sent", subject_type: "invitation", user_name: "Marloes Hendriks" },
		]);
	});

	test("revoking takes the access away, and logs it", async () => {
		const row = app.page.locator(`[data-portal-contact="${contact.email}"]`);
		await row.getByRole("button", { name: "Revoke" }).click();
		await app.submit(app.page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }));
		await row.waitFor({ state: "detached" });
		expect(await access()).toEqual([]);
		expect(
			await value(
				`select count(*) from member join user on user.id = member.user_id where user.email = ?`,
				[contact.email],
			),
		).toBe(0);
		expect(
			await value(
				`select action from activity where subject_type = 'portal_contact' order by id desc limit 1`,
			),
		).toBe("revoked");

		// Their next visit finds them in no organization: no portal.
		const response = await contactsPage.goto(`${baseURL}/portal`);
		await hydrated(contactsPage);
		expect(new URL(contactsPage.url()).pathname).not.toBe("/portal");
		expect(response?.status()).not.toBe(200);
		await contactsPage.context().close();
	});
});
