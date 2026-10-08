import { describe, expect, test } from "vite-plus/test";

import { countIn, organizations, rows, useApp, userNames, users, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

interface Engineer {
	id: number;
	organization_id: string;
	name: string;
	email: string;
	active: number;
	hourly_rate: number;
	user_id: string | null;
}

const engineer = async (id: number) =>
	(await rows<Engineer>(`select * from engineer where id = ?`, [id]))[0];
/** An engineer as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from engineer where id = ?`, [id]);
const namesIn = async (organizationId: string) =>
	(
		await rows<{ name: string }>(`select name from engineer where organization_id = ?`, [
			organizationId,
		])
	)
		.map((row) => row.name)
		.toSorted((a, b) => a.localeCompare(b));
const openStatuses = `('quote', 'scheduled', 'in_progress')`;
/** The engineer of an organization with the most open orders. */
const busiest = async (organizationId: string) =>
	(
		await rows<{ id: number; name: string; open: number }>(
			`select e.id, e.name, count(*) as open from engineer e join "order" o on o.engineer_id = e.id
			 where e.organization_id = ? and o.status in ${openStatuses}
			 group by e.id order by open desc, e.id limit 1`,
			[organizationId],
		)
	)[0];

const takenEmail = "Another engineer already uses this email address";

/** The names in the table, in order. */
const names = () => app.page.locator("tbody td a").allInnerTexts();
const search = () => app.page.getByLabel("Search engineers…");
const active = () => app.page.getByRole("checkbox", { name: "Active" });

/** Every name in the list, across its pages, sorted. */
async function allNames() {
	const { page } = app;
	const all: string[] = [];
	const next = page.getByRole("button", { name: "Go to next page" });
	for (;;) {
		all.push(...(await names()));
		if (!(await next.isEnabled())) break;
		await next.click();
	}
	return all.toSorted((a, b) => a.localeCompare(b));
}

/** Opens a faceted filter and ticks an option. */
async function filter(title: string, option: RegExp) {
	const { page } = app;
	await page.locator('[data-slot="popover-trigger"]', { hasText: title }).click();
	await page.getByRole("option", { name: option }).click();
	await page.keyboard.press("Escape");
}

/** Fills in the engineer form. */
async function fill(fields: { name: string; email: string; region?: string }) {
	const { page } = app;
	await page.getByLabel("Name").fill(fields.name);
	await page.getByLabel("Email").fill(fields.email);
	await page.getByLabel("Phone").fill("+31 20 123 4567");
	await page.getByLabel("Specialty").selectOption("hvac");
	await page.getByLabel("Region").selectOption(fields.region ?? "West");
	await page.getByLabel("Hourly rate").fill("72.50");
	await page.getByLabel("Hired").fill("2024-03-01");
}

/** Submits the form, expecting to land on the engineer's page, and returns their id. */
async function save(button: string) {
	const { page } = app;
	await page.getByRole("button", { name: button }).click();
	await page.waitForURL(/\/engineers\/\d+$/);
	await page.waitForLoadState("networkidle");
	return Number(app.path().split("/").pop());
}

/** Deletes the engineer whose page is open. */
async function deleteOpen() {
	const { page } = app;
	await page.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await page.waitForURL((url) => url.pathname === "/engineers");
	await page.waitForLoadState("networkidle");
}

/** The engineer created in North, who has no orders (so could be deleted). */
let created: number;
/** North's engineer with the most open orders. */
let busy: Awaited<ReturnType<typeof busiest>>;

describe("in North", () => {
	test("the list shows North's engineers by name, 10 per page", async () => {
		const { page } = app;
		await app.go("/engineers");
		const total = await countIn("engineer", north.id);
		expect(await app.rowCount()).toBe(total);
		const shown = await names();
		expect(shown).toHaveLength(Math.min(10, total));
		expect(shown).toEqual(shown.toSorted((a, b) => a.localeCompare(b)));

		await page.getByRole("button", { name: "Go to next page" }).click();
		expect(await names()).toHaveLength(Math.min(10, total - 10));
		await page.getByRole("button", { name: "Go to previous page" }).click();
		expect(await allNames()).toEqual(await namesIn(north.id));
	});

	test("searching finds an engineer by email address", async () => {
		await app.go("/engineers");
		const [someone] = await rows<{ name: string; email: string }>(
			`select name, email from engineer where organization_id = ? order by id limit 1 offset 8`,
			[north.id],
		);
		await search().fill(someone.email);
		expect(await names()).toEqual([someone.name]);
		await search().fill("");
	});

	test("filtering by status shows the inactive ones", async () => {
		await filter("Status", /Inactive/);
		const inactive = await rows<{ name: string }>(
			`select name from engineer where organization_id = ? and not active`,
			[north.id],
		);
		expect(inactive.length).toBeGreaterThan(0);
		expect((await names()).toSorted()).toEqual(inactive.map((row) => row.name).toSorted());
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("filtering by specialty and region combines", async () => {
		const count = async (where: string) =>
			Number(
				await value(`select count(*) from engineer where organization_id = ? and ${where}`, [
					north.id,
				]),
			);
		await filter("Specialty", /HVAC/);
		expect(await app.rowCount()).toBe(await count(`specialty = 'hvac'`));
		await filter("Region", /^North/);
		expect(await app.rowCount()).toBe(await count(`specialty = 'hvac' and region = 'North'`));
		await app.page.getByRole("button", { name: "Reset" }).click();
	});

	test("sorting by rate or open orders puts the highest first", async () => {
		await app.sortBy("Hourly rate", "descending");
		const [best] = await rows<{ hourly_rate: number }>(
			`select hourly_rate from engineer where organization_id = ? order by hourly_rate desc limit 1`,
			[north.id],
		);
		const [first] = await names();
		const [top] = await rows<{ hourly_rate: number }>(
			`select hourly_rate from engineer where organization_id = ? and name = ?`,
			[north.id, first],
		);
		expect(top.hourly_rate).toBe(best.hourly_rate);

		busy = await busiest(north.id);
		await app.sortBy("Open orders", "descending");
		const [mostOpen] = await names();
		const [{ open }] = await rows<{ open: number }>(
			`select count(*) as open from "order" o join engineer e on e.id = o.engineer_id
			 where e.organization_id = ? and e.name = ? and o.status in ${openStatuses}`,
			[north.id, mostOpen],
		);
		expect(open).toBe(busy.open);
	});

	test("unknown ids and South's engineers are a 404", async () => {
		const southId = await value<number>(`select min(id) from engineer where organization_id = ?`, [
			south.id,
		]);
		for (const key of ["99999", "abc", String(southId), `${southId}/edit`]) {
			expect((await app.go(`/engineers/${key}`))?.status(), key).toBe(404);
		}
	});

	test("an engineer's page shows their open orders and recent work", async () => {
		const { page } = app;
		const { id, name } = busy;
		const { email } = await engineer(id);
		await app.go(`/engineers/${id}`);
		expect(await page.locator("h1").innerText()).toBe(name);

		const card = (title: string) =>
			page.locator('[data-slot="card"]').filter({
				has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
			});
		const completed = Number(
			await value(
				`select count(*) from "order" where engineer_id = ? and completed_at is not null`,
				[id],
			),
		);
		expect(await card("Open orders").locator("tbody tr").count()).toBe(busy.open);
		expect(await card("Open orders").locator('a[href^="/orders/"]').first().innerText()).toMatch(
			/^ORD-/,
		);
		expect(await card("Recent work").locator("tbody tr").count()).toBe(Math.min(10, completed));
		expect(await page.locator('[data-slot="card-header"]').first().innerText()).toContain(
			String(busy.open),
		);
		expect(await page.getByRole("link", { name: email }).getAttribute("href")).toBe(
			`mailto:${email}`,
		);
	});

	test("an engineer with orders can't be deleted", async () => {
		const { page } = app;
		const before = await snapshot(busy.id);
		const assigned = Number(
			await value(`select count(*) from "order" where engineer_id = ?`, [busy.id]),
		);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await app.submit(dialog.getByRole("button", { name: "Delete" }));
		expect(await dialog.locator('[data-slot="field-error"]').innerText()).toContain(
			`${busy.name} can't be deleted while ${assigned} orders are assigned to them`,
		);
		expect(app.path()).toBe(`/engineers/${busy.id}`);
		expect(await snapshot(busy.id)).toEqual(before);
		await dialog.getByRole("button", { name: "Cancel" }).click();
	});

	test("adding an engineer validates the form first", async () => {
		const { page } = app;
		const before = await countIn("engineer", north.id);
		const existing = await engineer(busy.id);
		await app.go("/engineers/new");
		expect(await active().isChecked()).toBe(true);
		await app.submit(page.getByRole("button", { name: "Add engineer" }));
		expect(await app.issues()).not.toEqual([]);

		await fill({ name: "Test Engineer", email: "not-an-email" });
		// Skip the browser's own email check to reach the server's.
		await page
			.locator("form")
			.last()
			.evaluate((form: HTMLFormElement) => (form.noValidate = true));
		await app.submit(page.getByRole("button", { name: "Add engineer" }));
		expect(await app.issues()).toEqual(["Enter a valid email address"]);

		// Email addresses are unique per organization, ignoring case.
		await page.getByLabel("Email").fill(existing.email.toUpperCase());
		await app.submit(page.getByRole("button", { name: "Add engineer" }));
		expect(await app.issues()).toEqual([takenEmail]);
		expect(app.path()).toBe("/engineers/new");
		expect(await countIn("engineer", north.id)).toBe(before);
	});

	test("a new engineer is stored as entered", async () => {
		const { page } = app;
		const last = await value<number>(`select max(id) from engineer`);
		await page.getByLabel("Email").fill("test-engineer@fieldservice.example");
		created = await save("Add engineer");
		expect(created).toBeGreaterThan(last);
		await app.toast("Engineer added");
		const [row] = await rows(
			`select organization_id, name, email, specialty, region, hourly_rate, active,
			 date(hired_at, 'unixepoch', 'localtime') as hired from engineer where id = ?`,
			[created],
		);
		expect({ ...row }).toEqual({
			organization_id: north.id,
			name: "Test Engineer",
			email: "test-engineer@fieldservice.example",
			specialty: "hvac",
			region: "West",
			hourly_rate: 7250,
			active: 1,
			hired: "2024-03-01",
		});
	});

	test("the Active box saves both ways across edits", async () => {
		const { page } = app;
		const edit = async (toggle: boolean) => {
			await app.go(`/engineers/${created}/edit`);
			if (toggle) await active().click();
			await save("Save engineer");
			return (await engineer(created)).active;
		};
		expect(await edit(true)).toBe(0);
		await app.toast("Engineer saved");
		expect(await page.locator("main").innerText()).toContain("Inactive");
		expect(await edit(true)).toBe(1);
		expect(await edit(false)).toBe(1);
		expect(await edit(true)).toBe(0);
		expect(await edit(false)).toBe(0);
	});

	test("a refused edit keeps the box as the user left it", async () => {
		const { page } = app;
		const taken = await engineer(busy.id);
		await app.go(`/engineers/${created}/edit`);
		expect(await active().isChecked()).toBe(false);
		await active().click();
		await page.getByLabel("Email").fill(taken.email);
		await app.submit(page.getByRole("button", { name: "Save engineer" }));
		expect(await app.issues()).toEqual([takenEmail]);
		expect(await active().isChecked()).toBe(true);
		expect((await engineer(created)).active).toBe(0);

		await page.getByLabel("Email").fill("test-engineer@fieldservice.example");
		await page.getByLabel("Hourly rate").fill("80");
		expect(await save("Save engineer")).toBe(created);
		expect(await engineer(created)).toMatchObject({ active: 1, hourly_rate: 8000 });
	});

	test("an owner links an engineer to a member's account for the portal, and unlinks it", async () => {
		const { page } = app;
		const userId = (email: string) => value<string>(`select id from user where email = ?`, [email]);
		const account = () => page.getByLabel("User account");
		await app.go(`/engineers/${created}/edit`);
		expect(await account().inputValue()).toBe("");
		// Eli is already another engineer's account.
		const options = await account().locator("option").allInnerTexts();
		expect(options.some((option) => option.includes(userNames.planner))).toBe(true);
		expect(options.some((option) => option.includes(userNames.engineer))).toBe(false);

		await account().selectOption(await userId(users.planner));
		await page.getByRole("button", { name: "Save account" }).click();
		await app.toast("Account saved");
		expect((await engineer(created)).user_id).toBe(await userId(users.planner));
		await page.getByText(`Signs in as ${userNames.planner}`).waitFor();

		// Eli's engineer can't take Pat's account too.
		const eli = await value<number>(
			`select id from engineer where user_id = ? and organization_id = ?`,
			[await userId(users.engineer), north.id],
		);
		await app.go(`/engineers/${eli}/edit`);
		expect(
			(await account().locator("option").allInnerTexts()).some((o) =>
				o.includes(userNames.planner),
			),
		).toBe(false);

		await app.go(`/engineers/${created}/edit`);
		await account().selectOption("");
		await page.getByRole("button", { name: "Save account" }).click();
		await app.toast("Account saved");
		expect((await engineer(created)).user_id).toBeNull();
	});

	test("an engineer added inactive is stored inactive, and can be deleted", async () => {
		await app.go("/engineers/new");
		await fill({ name: "Test Engineer Two", email: "test-engineer-2@fieldservice.example" });
		await active().click();
		const id = await save("Add engineer");
		expect(await engineer(id)).toMatchObject({ organization_id: north.id, active: 0 });

		await deleteOpen();
		expect(await engineer(id)).toBeUndefined();
		expect((await app.go(`/engineers/${id}`))?.status()).toBe(404);
	});

	test("selected engineers are deactivated and activated together, and it's logged", async () => {
		const { page } = app;
		const picked = await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 1
			 order by id desc limit 2`,
			[north.id],
		);
		const bar = page.getByRole("region", { name: "Actions on the selected rows" });
		const select = async () => {
			for (const { name } of picked) {
				await page.locator("tbody tr", { hasText: name }).getByRole("checkbox").click();
			}
			await bar.getByText("2 selected").waitFor();
		};
		const activeOf = async () =>
			Promise.all(picked.map(async ({ id }) => (await engineer(id)).active));

		await app.go("/engineers?size=50");
		await select();
		// They're all active: activating would do nothing.
		await expect
			.poll(() =>
				bar.getByRole("button", { name: "Activate", exact: true }).getAttribute("aria-disabled"),
			)
			.toBe("true");
		await bar.getByRole("button", { name: "Deactivate", exact: true }).click();
		await app.toast("2 updated");
		expect(await activeOf()).toEqual([0, 0]);
		for (const { id } of picked) {
			const [logged] = await rows<{ action: string; changes: string }>(
				`select action, changes from activity where organization_id = ? and subject_type = 'engineer'
				 and subject_id = ? order by id desc limit 1`,
				[north.id, String(id)],
			);
			expect(logged.action).toBe("updated");
			expect(JSON.parse(logged.changes)).toEqual({ active: [true, false] });
		}
		await expect.poll(() => bar.count()).toBe(0);

		await select();
		await bar.getByRole("button", { name: "Activate", exact: true }).click();
		// (The first toast may still show.)
		await expect.poll(() => bar.count()).toBe(0);
		expect(await activeOf()).toEqual([1, 1]);
	});
});

describe("in South", () => {
	let own: Engineer;

	test("switching organization shows South's engineers", async () => {
		await app.switchOrganization(south.name);
		await app.go("/engineers");
		const total = await countIn("engineer", south.id);
		expect(await app.rowCount()).toBe(total);
		expect(await names()).toHaveLength(Math.min(10, total));
		expect(await allNames()).toEqual(await namesIn(south.id));
	});

	test("North's engineers are a 404", async () => {
		for (const path of [
			`/engineers/${busy.id}`,
			`/engineers/${busy.id}/edit`,
			`/engineers/${created}`,
		]) {
			expect((await app.go(path))?.status(), path).toBe(404);
		}
	});

	test("South's engineers show", async () => {
		const id = await value<number>(`select min(id) from engineer where organization_id = ?`, [
			south.id,
		]);
		own = await engineer(id);
		await app.go(`/engineers/${own.id}`);
		expect(await app.page.locator("h1").innerText()).toBe(own.name);
	});

	test("saving with the id of a North engineer is refused", async () => {
		const { page } = app;
		const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own.id)];

		await app.go(`/engineers/${own.id}/edit`);
		await page.getByLabel("Hourly rate").fill("1");
		await page.getByLabel("Email").fill("tampered@fieldservice.example");
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('form input[type="hidden"][name^="id"]')!.value =
					String(id);
			}, busy.id);
			return app.submit(page.getByRole("button", { name: "Save engineer" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/engineers/${own.id}/edit`);
		expect(await snapshot(busy.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("deleting with the id of a North engineer is refused", async () => {
		const { page } = app;
		// One without orders, who could be deleted in North.
		const [victimBefore, ownBefore] = [await snapshot(created), await snapshot(own.id)];
		expect(victimBefore).toHaveLength(1);

		await app.go(`/engineers/${own.id}`);
		await page.getByRole("button", { name: "Delete" }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.waitFor();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, created);
			return app.submit(dialog.getByRole("button", { name: "Delete" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/engineers/${own.id}`);
		expect(await snapshot(created)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("linking an account with the id of a North engineer is refused", async () => {
		const { page } = app;
		const [victimBefore, ownBefore] = [await snapshot(busy.id), await snapshot(own.id)];
		await app.go(`/engineers/${own.id}/edit`);
		const save = page.getByRole("button", { name: "Save account" });
		// Only South's members to choose from: the admin, not North's planner or engineer.
		const options = await page.getByLabel("User account").locator("option").allInnerTexts();
		expect(options.filter((option) => option !== "No account")).toEqual([
			expect.stringContaining(userNames.admin),
		]);
		await page.getByLabel("User account").selectOption({ index: 1 });
		const result = await app.expectingErrors(async () => {
			await save.evaluate((button, id) => {
				button.closest("form")!.querySelector<HTMLInputElement>('input[name^="id"]')!.value =
					String(id);
			}, busy.id);
			return app.submit(save);
		});
		expect(result).toMatch(/"status":404/);
		expect(await snapshot(busy.id)).toEqual(victimBefore);
		expect(await snapshot(own.id)).toEqual(ownBefore);
	});

	test("email addresses are unique within South only", async () => {
		const { page } = app;
		const northEmail = (await engineer(busy.id)).email;
		await app.go("/engineers/new");
		await fill({ name: "Test South Engineer", email: own.email });
		await app.submit(page.getByRole("button", { name: "Add engineer" }));
		expect(await app.issues()).toEqual([takenEmail]);

		await page.getByLabel("Email").fill(northEmail);
		const id = await save("Add engineer");
		expect(await engineer(id)).toMatchObject({
			organization_id: south.id,
			name: "Test South Engineer",
			email: northEmail,
		});
		await app.go("/engineers");
		expect(await allNames()).toContain("Test South Engineer");

		await app.go(`/engineers/${id}`);
		await deleteOpen();
		expect(await engineer(id)).toBeUndefined();
	});
});
