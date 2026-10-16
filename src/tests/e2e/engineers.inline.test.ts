import { describe, expect, test } from "vite-plus/test";

import { afresh, countIn, isRemote, organizations, quiet, rows, useApp, value } from "./app.ts";
import { remoteErrorStatus, tamperWithCommand } from "./remote-functions.ts";

const { north, south } = organizations;
const app = useApp();

/** An active engineer of an organization's (the last by name). */
const activeIn = async (organizationId: string) =>
	(
		await rows<{ id: number; name: string }>(
			`select id, name from engineer where organization_id = ? and active = 1
			 order by name desc limit 1`,
			[organizationId],
		)
	)[0];
const isActive = (id: number) => value<number>(`select active from engineer where id = ?`, [id]);
/** The engineer as stored, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from engineer where id = ?`, [id]);
/** The activity logged for an engineer, newest first. */
const activityOf = (id: number) =>
	rows<{ action: string; changes: string | null }>(
		`select action, changes from activity where subject_type = 'engineer' and subject_id = ?
		 order by id desc`,
		[String(id)],
	);

/** The status select in the row of the engineer `name`, showing `label`. */
const select = (name: string, label: string) =>
	app.page
		.locator('[data-slot="data-table"] tbody tr', { hasText: name })
		.getByRole("button", { name: `Change status of ${name}: ${label}` });

describe("changing whether an engineer is active in the list, in North", () => {
	let engineer: { id: number; name: string };

	test("choosing Inactive marks them inactive and logs it", async () => {
		const { page } = app;
		engineer = await activeIn(north.id);
		await app.go("/engineers");
		await page.getByLabel("Search engineers…").fill(engineer.name);
		await select(engineer.name, "Active").click();
		await page.getByRole("option", { name: "Inactive" }).click();

		await select(engineer.name, "Inactive").waitFor();
		await expect.poll(() => isActive(engineer.id)).toBe(0);
		// Its answer, with the refreshed rows, is in.
		await quiet(page);
		const [latest] = await activityOf(engineer.id);
		expect(latest.action).toBe("updated");
		expect(JSON.parse(latest.changes!)).toEqual({ active: [true, false] });
	});

	test("and back with the keyboard", async () => {
		const { page } = app;
		await select(engineer.name, "Inactive").focus();
		await page.keyboard.press("Enter");
		await page.getByRole("option", { name: "Active", exact: true }).waitFor();
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("Enter");

		await select(engineer.name, "Active").waitFor();
		await expect.poll(() => isActive(engineer.id)).toBe(1);
		// Its answer, with the refreshed rows, is in.
		await quiet(page);
	});

	test("South's engineer can't be changed by tampering with the id", async () => {
		const { page } = app;
		const theirs = await activeIn(south.id);
		const before = [await snapshot(engineer.id), await snapshot(theirs.id)];
		await select(engineer.name, "Active").click();
		await tamperWithCommand<{ id: number }>(page, "setEngineerActive", (arg) => ({
			...arg,
			id: theirs.id,
		}));
		const [response] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "setEngineerActive")),
				page.getByRole("option", { name: "Inactive" }).click(),
			]),
		);
		expect(await remoteErrorStatus(response)).toBe(404);
		await app.toast("Engineer not found");
		await select(engineer.name, "Active").waitFor();
		expect([await snapshot(engineer.id), await snapshot(theirs.id)]).toEqual(before);
	});
});

describe("filtering the engineers by a value in their row, in North", () => {
	/** The buttons of a column's values in the rows. */
	const valuesIn = (columnId: string, name: string) =>
		app.page
			.locator(`[data-slot="data-table"] tbody [data-column-id="${columnId}"]`)
			.getByRole("button", { name, exact: true });

	test("clicking a specialty filters by it, and clicking it again stops", async () => {
		const { page } = app;
		const [{ specialty, count }] = await rows<{ specialty: string; count: number }>(
			`select specialty, count(*) as count from engineer where organization_id = ?
			 group by specialty order by count desc, specialty limit 1`,
			[north.id],
		);
		const labels: Record<string, string> = {
			electrical: "Electrical",
			mechanical: "Mechanical",
			hvac: "HVAC",
			plumbing: "Plumbing",
			controls: "Controls",
		};
		const all = await countIn("engineer", north.id);
		await app.go(afresh("/engineers"));

		await valuesIn("specialty", `Filter by ${labels[specialty]}`).first().click();
		await page.waitForURL((url) => url.searchParams.get("specialty") === specialty);
		await expect.poll(() => app.rowCount()).toBe(count);
		await app.filterPill("Specialty").waitFor();

		await valuesIn("specialty", `Stop filtering by ${labels[specialty]}`).first().click();
		await page.waitForURL((url) => !url.searchParams.has("specialty"));
		await expect.poll(() => app.rowCount()).toBe(all);
	});

	test("clicking the status badge filters by it, while its arrow changes it", async () => {
		const { page } = app;
		const active = await value<number>(
			`select count(*) from engineer where organization_id = ? and active = 1`,
			[north.id],
		);
		const engineer = await activeIn(north.id);
		await app.go(afresh("/engineers"));

		await valuesIn("status", "Filter by Active").first().click();
		await page.waitForURL((url) => url.searchParams.get("status") === "active");
		await expect.poll(() => app.rowCount()).toBe(active);

		await page.getByLabel("Search engineers…").fill(engineer.name);
		await select(engineer.name, "Active").click();
		await page.getByRole("option", { name: "Inactive" }).waitFor();
		await page.keyboard.press("Escape");
		expect(await isActive(engineer.id)).toBe(1);
		expect(new URL(page.url()).searchParams.get("status")).toBe("active");
	});
});
