/**
 * The docks' simulation for the demo (`#lib/server/simulation.ts`, the module's
 * `server/simulation.ts`): SHLTR's board has the simulation bar; a manager plays it, changes its
 * speed and resets it, and its ticks move the docks through the feed; a member sees its state
 * without the controls; a tenant without the simulation has no bar. That the commands refuse a
 * planner, another tenant and a tenant offered none, and what they log, is
 * `src/tests/unit/lib/components/simulation/server/simulation.spec.ts`'s. The tests start with it
 * paused (`global-setup.ts`), and this file leaves it paused, in the mockup's states.
 */
import { describe, expect, test } from "vite-plus/test";

import { fixture, organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { shltrOwner, shltrPlanner } from "./helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: shltrOwner });

const bar = () => app.page.locator('[data-simulation="docks"]');
const card = (code: string) => app.page.locator(`[data-dock="${code}"]`);

/** SHLTR's docks simulation as stored. */
const simulation = async () =>
	(
		await rows<{ running: number; speed: number; last_tick_at: number; started_at: number }>(
			`select running, speed, last_tick_at, started_at from simulation
			 where organization_id = ? and module_id = 'docks'`,
			[shltr.id],
		)
	)[0];

/** A dock's live facts as stored. */
const stateOf = async (code: string) =>
	(
		await rows<{
			locked: number;
			door_open_since: number | null;
			scp_online: number;
			door_alert: string | null;
		}>(
			`select s.locked, s.door_open_since, s.scp_online, s.door_alert from dock_state s
			 join dock_position d on d.id = s.dock_id where d.organization_id = ? and d.code = ?`,
			[shltr.id, code],
		)
	)[0];

describe("the simulation bar", () => {
	test("is on SHLTR's board, paused, and the banner says the feed is simulated", async () => {
		const { page } = app;
		await app.go("/docks");
		await card("DOCK 05").waitFor();
		await bar().waitFor();
		expect(await bar().getAttribute("data-running")).toBe("false");
		expect(await bar().locator("[data-simulation-state]").textContent()).toContain("paused");
		expect(await page.locator("[data-feed]").getAttribute("data-feed")).toBe("simulated");
		expect(await page.locator("[data-feed]").textContent()).toContain("Simulation");
	});

	test("a manager plays it at 30×, and its ticks move the docks through the feed", async () => {
		await bar().getByRole("button", { name: "Start" }).click();
		await expect.poll(async () => (await simulation()).running).toBe(1);
		await bar().getByRole("button", { name: "30×" }).click();
		await expect.poll(async () => (await simulation()).speed).toBe(30);
		await bar().locator('[data-simulation-state="running"]').waitFor();
		// The badge follows the stored speed once the page's query has it.
		await expect
			.poll(() => bar().locator("[data-simulation-state]").textContent())
			.toContain("simulation 30×");

		// The open page ticks it: the docks' events come in as the feed's, and the board follows.
		await expect
			.poll(
				() =>
					value<number>(
						`select count(*) from dock_event where organization_id = ? and event_id like 'sim-%'
						 and outcome = 'applied'`,
						[shltr.id],
					),
				{ timeout: 30_000 },
			)
			.toBeGreaterThan(0);
		// DOCK 06's driver locks at last (its door has been open 44 minutes), and the board follows.
		await expect
			.poll(
				() =>
					value<number>(
						`select count(*) from dock_event e join dock_position d on d.id = e.dock_id
						 where e.organization_id = ? and d.code = 'DOCK 06' and e.type = 'lock'
						 and e.event_id like 'sim-%'`,
						[shltr.id],
					),
				{ timeout: 30_000 },
			)
			.toBeGreaterThan(0);
		await expect
			.poll(async () => {
				const shown = await card("DOCK 06")
					.locator("[data-dock-lock]")
					.getAttribute("data-dock-lock");
				const { locked } = await stateOf("DOCK 06");
				return shown === (locked ? "locked" : "unlocked");
			})
			.toBe(true);
	});

	test("a reset puts the docks back in the mockup's states", async () => {
		// Paused first, so no tick is under way while the docks are put back.
		await bar().getByRole("button", { name: "Pause" }).click();
		await expect.poll(async () => (await simulation()).running).toBe(0);
		await app.page.waitForTimeout(1000);
		const started = (await simulation()).started_at;
		await bar().getByRole("button", { name: "Reset simulation" }).click();
		await expect.poll(async () => (await simulation()).started_at).toBeGreaterThan(started);
		// Paused right away, so the mockup's states hold for the files after this one.
		await bar().getByRole("button", { name: "Pause" }).click();
		await expect.poll(async () => (await simulation()).running).toBe(0);
		expect((await simulation()).speed).toBe(30);

		// The board shows every state, live. What the reset stores (and that it makes no notice
		// or order) is `simulation.spec.ts`'s.
		for (const [code, state] of [
			["DOCK 05", "loading"],
			["DOCK 06", "occupied"],
			["DOCK 07", "free"],
			["DOCK 08", "fault"],
		]) {
			await card(code).locator(`[data-dock-state="${state}"]`).waitFor();
		}
		const timer = async (code: string) =>
			(await card(code).locator("[data-door-timer]").textContent())?.trim();
		expect(await timer("DOCK 05")).toMatch(/^2\d:\d\d$/);
		expect(await timer("DOCK 08")).toMatch(/^1:2\d:\d\d$/);
		expect(await card("DOCK 08").locator('[data-dock-drawing][data-lit="red"]').count()).toBe(1);
		expect(await card("DOCK 07").locator('[data-dock-drawing][data-truck="away"]').count()).toBe(1);
	});
});

describe("who may drive it", () => {
	test("a planner, who's no manager, sees its state, without the controls", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		try {
			await page.goto(`${app.page.url()}`);
			const planners = page.locator('[data-simulation="docks"]');
			await planners.locator("[data-simulation-state]").waitFor();
			expect(await planners.getByRole("button").count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});

	test("a tenant offered no simulation has no bar", async () => {
		const { page } = app;
		const [row] = await fixture<Record<string, number | string>>(
			`delete from simulation where organization_id = ? and module_id = 'docks' returning *`,
			[shltr.id],
		);
		try {
			await app.go("/docks");
			await card("DOCK 05").waitFor();
			expect(await bar().count()).toBe(0);
			expect(await page.locator("[data-feed]").getAttribute("data-feed")).toBe("live");
		} finally {
			await fixture(
				`insert into simulation (organization_id, module_id, running, speed, last_tick_at, started_at)
				 values (?, ?, ?, ?, ?, ?)`,
				[
					row.organization_id,
					row.module_id,
					row.running,
					row.speed,
					row.last_tick_at,
					row.started_at,
				],
			);
		}
	});
});
