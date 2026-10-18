/**
 * The members page: the team, inviting someone (and resending), the invited person joining with
 * their own account, used, cancelled and made-up links, changing a role, removing a member (who then
 * can't work there), the activity log, an existing user accepting an invitation to another
 * organization, and in South the remove dialog with a North member's id refused. What the page's
 * remote functions refuse before better-auth's part is `routes/(app)/settings/members/members.spec.ts`'s.
 */
import type { Page } from "playwright";
import { afterAll, describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";

import {
	baseURL,
	hydrated,
	linkInMail,
	newContext,
	organizations,
	rows,
	sentMail,
	useApp,
	users,
	userNames,
	value,
	quiet,
} from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const robin = { name: "Robin Rivera", email: "robin.rivera@example.com", password: "robin-s3cret" };

/** Robin's own browser, once they've accepted their invitation. */
let robinsPage: Page | undefined;
afterAll(() => robinsPage?.context().close());

const memberRow = (email: string) => app.page.locator(`tr[data-member="${email}"]`);
const invitationRow = (email: string) => app.page.locator(`tr[data-invitation="${email}"]`);
const header = () => app.page.locator('[data-sidebar="header"]').innerText();

const memberId = (organizationId: string, email: string) =>
	value<string>(
		`select member.id from member join user on user.id = member.user_id
		 where member.organization_id = ? and user.email = ?`,
		[organizationId, email],
	);
const roleOf = (organizationId: string, email: string) =>
	value<string | undefined>(
		`select member.role from member join user on user.id = member.user_id
		 where member.organization_id = ? and user.email = ?`,
		[organizationId, email],
	);
const invitations = (email: string) =>
	rows<{ id: string; organization_id: string; role: string; status: string; expires_at: number }>(
		`select * from invitation where email = ? order by created_at`,
		[email],
	);

/** A signed-out browser of someone else, e.g. the invited person's. */
async function otherBrowser() {
	const context = await newContext(app.page.context().browser()!);
	return context.newPage();
}

/** The name of a remote form's field in the page, e.g. `memberId/abc123/changeRole`. */
const fieldName = (name: string) => `[name="${name}"], [name^="${name}/"]`;

/** Sets a hidden field before a submission, the way someone tampering with the page would. */
const tamper = (form: ReturnType<Page["locator"]>, name: string, to: string) =>
	form
		.locator(`input[type="hidden"]`)
		.and(form.locator(fieldName(name)))
		.evaluate((input: HTMLInputElement, to) => {
			input.value = to;
		}, to);

/** Picks a member's role, which submits the change, and waits for the server's answer. */
async function chooseRole(email: string, name: string, role: string) {
	const [response] = await Promise.all([
		app.page.waitForResponse(
			(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
		),
		memberRow(email).getByLabel(`Role of ${name}`).selectOption(role),
	]);
	const body = await response.text();
	await quiet(app.page);
	return body;
}

async function invite(email: string, role: string) {
	const { page } = app;
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page.getByLabel("Role", { exact: true }).selectOption(role);
	return app.submit(page.getByRole("button", { name: "Send invitation" }));
}

describe("members", () => {
	test("the members page lists the organization's people", async () => {
		await app.go("/settings");
		await app.page.getByRole("link", { name: "Manage members" }).click();
		await app.page.waitForURL((url) => url.pathname === "/settings/members");
		await hydrated(app.page);
		expect(await memberRow(users.admin).innerText()).toContain("You");
		expect(await memberRow(users.planner).innerText()).toContain(userNames.planner);
		// Nobody changes or removes themselves; the others' roles can be changed.
		expect(await memberRow(users.admin).locator("select").count()).toBe(0);
		expect(await memberRow(users.admin).getByRole("button", { name: "Remove" }).count()).toBe(0);
		expect(
			await memberRow(users.planner).getByLabel(`Role of ${userNames.planner}`).inputValue(),
		).toBe("member");
	});
});

describe("invitations", () => {
	test("an owner invites someone by email", async () => {
		await invite(robin.email, "admin");
		await app.toast(`Invitation sent to ${robin.email}`);
		expect(await invitations(robin.email)).toMatchObject([
			{ organization_id: north.id, role: "admin", status: "pending" },
		]);
		expect(await invitationRow(robin.email).innerText()).toContain("Admin");
		const [mail] = sentMail(robin.email);
		expect(mail.subject).toBe(`${userNames.admin} invited you to ${north.name} on Fieldworks`);
		expect(linkInMail(robin.email)).toBe(
			`${baseURL}/invite/${(await invitations(robin.email))[0].id}`,
		);
	});

	test("an invitation can be sent again, valid for longer", async () => {
		const [before] = await invitations(robin.email);
		await app.submit(invitationRow(robin.email).getByRole("button", { name: "Resend" }));
		await app.toast(`Invitation sent to ${robin.email} again`);
		const [after] = await invitations(robin.email);
		expect(after).toMatchObject({ id: before.id, status: "pending" });
		expect(after.expires_at).toBeGreaterThan(before.expires_at);
		expect(sentMail(robin.email)).toHaveLength(2);
	});

	test("the invited person creates their account and joins with the invited role", async () => {
		const page = await otherBrowser();
		robinsPage = page;
		await page.goto(linkInMail(robin.email));
		await hydrated(page);
		expect(await page.getByText(`Join ${north.name}`).first().isVisible()).toBe(true);
		expect(await page.getByLabel("Email").inputValue()).toBe(robin.email);

		await page.getByLabel("Your name").fill(robin.name);
		await page.getByLabel("Password", { exact: true }).fill(robin.password);
		await page.getByLabel("Repeat the password").fill("something-else");
		await page.getByRole("button", { name: "Create account and join" }).click();
		await page.getByText("The passwords don't match.").waitFor();

		await page.getByLabel("Password", { exact: true }).fill(robin.password);
		await page.getByLabel("Repeat the password").fill(robin.password);
		await page.getByRole("button", { name: "Create account and join" }).click();
		await page.waitForURL((url) => url.pathname === "/");
		await quiet(page);
		expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(north.name);
		expect(await page.locator('[data-slot="sidebar-footer"]').innerText()).toContain(robin.name);

		expect(await roleOf(north.id, robin.email)).toBe("admin");
		expect(await invitations(robin.email)).toMatchObject([{ status: "accepted" }]);
		expect(
			await value(`select email_verified from user where email = ?`, [robin.email]),
		).toBeTruthy();
		// Their organizations: only the one they were invited to.
		expect(
			await value(
				`select count(*) from member join user on user.id = member.user_id where user.email = ?`,
				[robin.email],
			),
		).toBe(1);
	});

	test("the owner sees them as a member; used, cancelled and made-up invitation links say so", async () => {
		await app.go("/settings/members");
		expect(await memberRow(robin.email).getByLabel(`Role of ${robin.name}`).inputValue()).toBe(
			"admin",
		);
		expect(await invitationRow(robin.email).count()).toBe(0);

		await invite("never.mind@example.com", "member");
		await app.toast("Invitation sent to never.mind@example.com");
		await app.submit(
			invitationRow("never.mind@example.com").getByRole("button", { name: "Cancel" }),
		);
		expect(await invitations("never.mind@example.com")).toMatchObject([{ status: "canceled" }]);
		await expect.poll(() => invitationRow("never.mind@example.com").count()).toBe(0);

		const page = await otherBrowser();
		try {
			await page.goto(linkInMail(robin.email));
			await page.getByText("This invitation has been used").waitFor();
			await page.goto(linkInMail("never.mind@example.com"));
			await page.getByText("This invitation was cancelled").waitFor();
			await page.goto(`${baseURL}/invite/made-up`);
			await page.getByText("This invitation link isn't valid").waitFor();
			// Signing up still isn't possible otherwise.
			expect(await page.getByRole("button", { name: "Create account and join" }).count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("roles and removal", () => {
	test("an owner makes another member an owner, and demotes them again", async () => {
		await chooseRole(robin.email, robin.name, "owner");
		await app.toast(`${robin.name}'s role changed`);
		expect(await roleOf(north.id, robin.email)).toBe("owner");
		await chooseRole(robin.email, robin.name, "member");
		await app.toast(`${robin.name}'s role changed`);
		expect(await roleOf(north.id, robin.email)).toBe("member");
	});

	test("an owner removes a member, who then can't work in the organization", async () => {
		const { page } = app;
		await app.go("/settings/members");
		await memberRow(robin.email).getByRole("button", { name: "Remove" }).click();
		const dialog = page.getByRole("alertdialog");
		expect(await dialog.innerText()).toContain(`Remove ${robin.name}?`);
		await app.submit(dialog.getByRole("button", { name: "Remove" }));
		await memberRow(robin.email).waitFor({ state: "detached" });
		expect(await roleOf(north.id, robin.email)).toBeUndefined();

		// Robin has no other organization, so the app tells them they're not a member.
		await robinsPage!.reload();
		await robinsPage!.getByText("You're not a member of any organization").waitFor();
	});

	test("the activity log has the invitations and the changes to members, by who made them", async () => {
		const logged = (type: string, label: string) =>
			rows<{ user_name: string; action: string; changes: string | null; note: string | null }>(
				`select user_name, action, changes, note from activity where organization_id = ?
				 and subject_type = ? and subject_label = ? order by id`,
				[north.id, type, label],
			).then((found) =>
				found.map((row) => ({ ...row, changes: row.changes && JSON.parse(row.changes) })),
			);
		expect(await logged("invitation", robin.email)).toEqual([
			{ user_name: userNames.admin, action: "sent", changes: null, note: "As Admin" },
			{ user_name: userNames.admin, action: "resent", changes: null, note: "As Admin" },
			// In North, although Robin had no organization yet.
			{ user_name: robin.name, action: "accepted", changes: null, note: null },
		]);
		expect((await logged("invitation", "never.mind@example.com")).map((e) => e.action)).toEqual([
			"sent",
			"cancelled",
		]);
		// The refused change of the admin's own role logged nothing.
		expect(await logged("member", robin.name)).toEqual([
			{
				user_name: userNames.admin,
				action: "updated",
				changes: { role: ["admin", "owner"] },
				note: null,
			},
			{
				user_name: userNames.admin,
				action: "updated",
				changes: { role: ["owner", "member"] },
				note: null,
			},
			{ user_name: userNames.admin, action: "removed", changes: null, note: null },
		]);
		expect(await logged("member", userNames.admin)).toEqual([]);
	});
});

describe("other organizations", () => {
	test("an existing user signs in to accept an invitation to another organization", async () => {
		await app.switchOrganization(south.name);
		await app.go("/settings/members");
		await invite(users.planner, "member");

		const page = await otherBrowser();
		try {
			await page.goto(linkInMail(users.planner));
			await hydrated(page);
			await page.getByRole("link", { name: "Sign in to accept" }).click();
			await page.waitForURL((url) => url.pathname === "/login");
			await hydrated(page);
			await page.getByLabel("Email").fill(users.planner);
			await page.getByLabel("Password").fill(DEMO_PASSWORD);
			await page.getByRole("button", { name: "Sign in" }).click();
			await page.waitForURL((url) => url.pathname.startsWith("/invite/"));
			await hydrated(page);
			await page.getByRole("button", { name: `Join ${south.name}` }).click();
			await page.waitForURL((url) => url.pathname === "/");
			await quiet(page);
			expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		} finally {
			await page.context().close();
		}
		expect(await roleOf(south.id, users.planner)).toBe("member");
		expect(await roleOf(north.id, users.planner)).toBe("member");
	});

	// The other refusals of North's invitations and members (cancelling, resending, changing a
	// role), the last owner's and a planner's are `routes/(app)/settings/members/members.spec.ts`'s.
	test("removing with the id of a North member is refused", async () => {
		const { page } = app;
		await app.go("/settings/members");
		expect(await header()).toContain(south.name);
		const plannerInNorth = await memberId(north.id, users.planner);

		await memberRow(users.planner).getByRole("button", { name: "Remove" }).click();
		const dialog = page.getByRole("alertdialog");
		const outcome = await app.expectingErrors(async () => {
			await tamper(dialog.locator("form"), "id", plannerInNorth);
			return app.submit(dialog.getByRole("button", { name: "Remove" }));
		});
		expect(outcome).toMatch(/"status":404/);
		expect(await roleOf(north.id, users.planner)).toBe("member");
		expect(await roleOf(south.id, users.planner)).toBe("member");
	});
});
