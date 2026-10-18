/**
 * The engineers list's status cell: choosing Inactive (and back, by keyboard) changes the engineer
 * and logs it, and its badge filters. That `setEngineerActive` doesn't find another tenant's
 * engineer is `engineers/server/engineers.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { afresh, organizations, quiet, rows, useApp, value } from "./app.ts";

const { north } = organizations;
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
});

describe("filtering the engineers by a value in their row, in North", () => {
	/** The buttons of a column's values in the rows. */
	const valuesIn = (columnId: string, name: string) =>
		app.page
			.locator(`[data-slot="data-table"] tbody [data-column-id="${columnId}"]`)
			.getByRole("button", { name, exact: true });

	// Clicking a value to filter by it, and again to stop, is `cell-filter.svelte.spec.ts`'s.
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
