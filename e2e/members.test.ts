import type { Page } from "playwright";
import { afterAll, describe, expect, test } from "vite-plus/test";

import { DEMO_PASSWORD } from "../src/lib/server/db/demo.ts";
import {
	baseURL,
	hydrated,
	linkInMail,
	organizations,
	rows,
	sentMail,
	useApp,
	users,
	value,
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
	const context = await app.page.context().browser()!.newContext();
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
	await app.page.waitForLoadState("networkidle");
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
		expect(await memberRow(users.planner).innerText()).toContain("Pat Planner");
		// Nobody changes or removes themselves; the others' roles can be changed.
		expect(await memberRow(users.admin).locator("select").count()).toBe(0);
		expect(await memberRow(users.admin).getByRole("button", { name: "Remove" }).count()).toBe(0);
		expect(await memberRow(users.planner).getByLabel("Role of Pat Planner").inputValue()).toBe(
			"member",
		);
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
		expect(mail.subject).toBe(`Avery Admin invited you to ${north.name} on Fieldworks`);
		expect(linkInMail(robin.email)).toBe(
			`${baseURL}/invite/${(await invitations(robin.email))[0].id}`,
		);
	});

	test("inviting a member, or someone invited already, is refused", async () => {
		await invite(robin.email, "member");
		expect(await app.issues()).toContain(
			`${robin.email} has been invited already. Resend that invitation instead.`,
		);
		await invite(users.planner, "member");
		expect(await app.issues()).toContain(`${users.planner} is already a member.`);
		expect(await invitations(robin.email)).toHaveLength(1);
		expect(await invitations(users.planner)).toHaveLength(0);
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
		await page.waitForLoadState("networkidle");
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

	test("the owner sees them as a member, no longer as invited", async () => {
		await app.go("/settings/members");
		expect(await memberRow(robin.email).getByLabel(`Role of ${robin.name}`).inputValue()).toBe(
			"admin",
		);
		expect(await invitationRow(robin.email).count()).toBe(0);
	});

	test("used, cancelled and made-up invitation links say so", async () => {
		await invite("never.mind@example.com", "member");
		await app.submit(
			invitationRow("never.mind@example.com").getByRole("button", { name: "Cancel" }),
		);
		expect(await invitations("never.mind@example.com")).toMatchObject([{ status: "canceled" }]);
		expect(await invitationRow("never.mind@example.com").count()).toBe(0);

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
	test("an owner makes another member an owner", async () => {
		await chooseRole(robin.email, robin.name, "owner");
		await app.toast(`${robin.name}'s role changed`);
		expect(await roleOf(north.id, robin.email)).toBe("owner");
	});

	test("nobody can change their own role, not even with a tampered form", async () => {
		const row = memberRow(robin.email);
		await tamper(row.locator("form"), "memberId", await memberId(north.id, users.admin));
		await chooseRole(robin.email, robin.name, "member");
		await row.getByText("You can't change your own role.").waitFor();
		expect(await roleOf(north.id, users.admin)).toBe("owner");
		expect(await roleOf(north.id, robin.email)).toBe("owner");
	});

	test("an owner demotes a member", async () => {
		await app.go("/settings/members");
		await chooseRole(robin.email, robin.name, "member");
		expect(await roleOf(north.id, robin.email)).toBe("member");
	});

	test("an owner removes a member, who then can't work in the organization", async () => {
		const { page } = app;
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

	test("a member can't invite, change roles or remove anyone", async () => {
		const { page } = app;
		await app.go("/settings/members");
		const forms = await page.evaluate(() =>
			[...document.querySelectorAll("form")].map((form) => ({
				action: form.action,
				fields: [...new FormData(form)].map(([name, value]) => [name, value as string]),
			})),
		);
		// Field names are namespaced, e.g. `memberId/abc123/changeRole`.
		const has = (f: (typeof forms)[number], field: string) =>
			f.fields.some(([name]) => name.split("/")[0] === field);
		// Pat the planner's row, whose role is member.
		const changeForm = forms.find(
			(f) =>
				has(f, "memberId") &&
				f.fields.some(([name, value]) => name.split("/")[0] === "role" && value === "member"),
		)!;
		const inviteForm = forms.find((f) => has(f, "email"))!;
		expect(changeForm.fields.map(([name, value]) => [name.split("/")[0], value])).toContainEqual([
			"role",
			"member",
		]);

		const planner = await otherBrowser();
		try {
			await planner.goto(`${baseURL}/login`);
			await hydrated(planner);
			await planner.getByLabel("Email").fill(users.planner);
			await planner.getByLabel("Password").fill(DEMO_PASSWORD);
			await planner.getByRole("button", { name: "Sign in" }).click();
			await planner.waitForURL((url) => url.pathname === "/");
			await planner.goto(`${baseURL}/settings/members`);
			await hydrated(planner);
			// Read-only: the list without the controls.
			expect(await planner.locator('tr[data-member="planner@fieldworks.example"]').count()).toBe(1);
			expect(await planner.getByText("Invite someone").count()).toBe(0);
			expect(await planner.locator("select").count()).toBe(0);

			const statuses = await planner.evaluate(
				async ({ changeForm, inviteForm }) => {
					// Submitted the way a browser without JavaScript would.
					const post = async ({ action, fields }: typeof changeForm, set: string[][]) => {
						const body = new URLSearchParams(fields);
						for (const [field, value] of set) {
							const name = fields.find(([n]) => n.split("/")[0] === field)?.[0] ?? field;
							body.set(name, value);
						}
						const headers = { accept: "text/html" };
						return (await fetch(action, { method: "POST", body, headers })).status;
					};
					return [
						await post(changeForm, [["role", "admin"]]),
						await post(inviteForm, [
							["email", "sneaky@example.com"],
							["role", "admin"],
						]),
					];
				},
				{ changeForm, inviteForm },
			);
			expect(statuses).toEqual([403, 403]);
		} finally {
			await planner.context().close();
		}
		expect(await roleOf(north.id, users.planner)).toBe("member");
		expect(await invitations("sneaky@example.com")).toHaveLength(0);
	});
});

describe("other organizations", () => {
	const northInvitee = "north.only@example.com";

	test("an existing user signs in to accept an invitation to another organization", async () => {
		await invite(northInvitee, "member");
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
			await page.waitForLoadState("networkidle");
			expect(await page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		} finally {
			await page.context().close();
		}
		expect(await roleOf(south.id, users.planner)).toBe("member");
		expect(await roleOf(north.id, users.planner)).toBe("member");
	});

	test("the last owner can't be demoted or removed", async () => {
		const { page } = app;
		await app.go("/settings/members");
		expect(await header()).toContain(south.name);
		const ownMemberId = await memberId(south.id, users.admin);

		const row = memberRow(users.planner);
		await tamper(row.locator("form"), "memberId", ownMemberId);
		await chooseRole(users.planner, "Pat Planner", "admin");
		await row.getByText(/needs at least one owner/).waitFor();

		await row.getByRole("button", { name: "Remove" }).click();
		const dialog = page.getByRole("alertdialog");
		await tamper(dialog.locator("form"), "id", ownMemberId);
		await app.submit(dialog.getByRole("button", { name: "Remove" }));
		await dialog.getByText(/last owner can't be removed/).waitFor();
		await dialog.getByRole("button", { name: "Cancel" }).click();

		expect(await roleOf(south.id, users.admin)).toBe("owner");
		expect(await roleOf(south.id, users.planner)).toBe("member");
	});

	test("South's admins can't cancel North's invitations or change North's members", async () => {
		const { page } = app;
		await app.go("/settings/members");
		await invite("south.only@example.com", "member");
		const [northInvitation] = await invitations(northInvitee);
		const plannerInNorth = await memberId(north.id, users.planner);

		const outcomes = await app.expectingErrors(async () => {
			const results: string[] = [];
			const cancelForm = invitationRow("south.only@example.com")
				.locator("form")
				.filter({ has: page.getByRole("button", { name: "Cancel" }) });
			await tamper(cancelForm, "id", northInvitation.id);
			results.push(await app.submit(cancelForm.getByRole("button", { name: "Cancel" })));

			await app.go("/settings/members");
			const resendForm = invitationRow("south.only@example.com")
				.locator("form")
				.filter({ has: page.getByRole("button", { name: "Resend" }) });
			await tamper(resendForm, "id", northInvitation.id);
			results.push(await app.submit(resendForm.getByRole("button", { name: "Resend" })));

			await app.go("/settings/members");
			await tamper(memberRow(users.planner).locator("form"), "memberId", plannerInNorth);
			results.push(await chooseRole(users.planner, "Pat Planner", "admin"));

			await app.go("/settings/members");
			await memberRow(users.planner).getByRole("button", { name: "Remove" }).click();
			const dialog = page.getByRole("alertdialog");
			await tamper(dialog.locator("form"), "id", plannerInNorth);
			results.push(await app.submit(dialog.getByRole("button", { name: "Remove" })));
			return results;
		});
		for (const outcome of outcomes) expect(outcome).toMatch(/"status":404/);

		expect(await invitations(northInvitee)).toMatchObject([
			{ id: northInvitation.id, status: "pending" },
		]);
		expect(sentMail(northInvitee)).toHaveLength(1);
		expect(await roleOf(north.id, users.planner)).toBe("member");
		expect(await roleOf(south.id, users.planner)).toBe("member");
	});
});
