/**
 * SHLTR's P1 simulation on the site's page (`#lib/server/simulation.ts`, energy's
 * `server/live-simulation.ts`): a manager plays it from the bar, its ticks post the intervals
 * since the latest reading through the ingest (no gap, no zone offline), reset puts yesterday and
 * today back as the seed has them, and pausing stops it; a planner sees its state but can't drive
 * it; a tenant offered no simulation gets no bar. That another tenant can't drive SHLTR's is
 * `remote-functions.spec.ts`'s and `simulation.spec.ts`'s.
 */
import type { InValue } from "@libsql/client";
import { describe, expect, test } from "vite-plus/test";

import { fixture, isRemote, organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { callCommand, lastQuarter, riedel, shltrOwner, shltrPlanner } from "./helpers.ts";

const { shltr } = organizations;
// North's and South's admin; SHLTR's people sign in on pages of their own.
const app = useApp();

/** The remote commands' URLs, as SHLTR's owner's page called them, to call from elsewhere. */
const commands: Record<string, string> = {};

const running = () =>
	value(`select running from simulation where organization_id = ? and module_id = 'energy'`, [
		shltr.id,
	]);

/** The intervals each of Riedel's metered zones has a reading of in the last three hours. */
async function lastThreeHours(siteId: number) {
	const to = lastQuarter();
	const from = to.subtract({ hours: 3 });
	return rows<{ code: string; count: number; latest: number }>(
		`select z.code, count(*) as count, max(r.start) as latest from energy_reading r
		 join energy_zone z on z.id = r.zone_id
		 where z.energy_site_id = ? and z.code != 'Z-EXP' and r.start > ? and r.start <= ?
		 group by z.code order by z.code`,
		[siteId, from.epochMilliseconds / 1000, to.epochMilliseconds / 1000],
	);
}

describe("SHLTR's P1 simulation", () => {
	test("a manager plays it, its ticks post the readings since the latest, reset and pause", async () => {
		const { page } = await signedInPage(app, shltrOwner);
		const { siteId } = await riedel();
		try {
			page.on("request", (request) => {
				for (const name of [
					"playSimulation",
					"tickSimulation",
					"setSimulationSpeed",
					"resetSimulationState",
				]) {
					if (isRemote(request.url(), name)) commands[name] = request.url();
				}
			});
			await page.goto(new URL(`/energy/${siteId}`, page.url()).href);
			const bar = page.locator('[data-simulation="energy"]');
			const state = page.locator('[data-hero-chip="state"]');
			// The e2e template starts paused.
			await bar.waitFor();
			expect(await bar.getAttribute("data-running")).toBe("false");
			expect(await state.textContent()).toContain("paused");
			expect(await bar.getByText("P1 simulation").count()).toBe(1);

			await bar.getByRole("button", { name: "Start" }).click();
			await expect.poll(() => bar.getAttribute("data-running")).toBe("true");
			await expect.poll(() => state.textContent()).toContain("simulation 1×");
			expect(await running()).toBe(1);

			// The bar's first tick fills every interval since the seed's latest, through the ingest.
			await expect
				.poll(async () => (await lastThreeHours(siteId)).every((zone) => zone.count === 12))
				.toBe(true);
			const zones = await lastThreeHours(siteId);
			expect(zones).toHaveLength(7);
			expect(zones.every((zone) => zone.latest === lastQuarter().epochMilliseconds / 1000)).toBe(
				true,
			);
			// So no metered zone is offline; the external unit sends nothing, as in the mockup.
			await expect.poll(() => page.locator('[data-zone][data-tone="offline"]').count()).toBe(1);
			expect(await page.locator('[data-zone="Z-EXP"]').getAttribute("data-tone")).toBe("offline");

			await bar.getByRole("button", { name: "30×" }).click();
			await expect.poll(() => state.textContent()).toContain("simulation 30×");

			// Reset: yesterday and today as the seed has them, every interval of yesterday.
			await bar.getByRole("button", { name: "Reset simulation" }).click();
			await page.getByText("The simulation starts over.").waitFor();
			await expect.poll(() => state.textContent()).toContain("simulation 1×");
			const midnight = Temporal.Now.zonedDateTimeISO("Europe/Amsterdam").startOfDay();
			const yesterday = await value(
				`select count(*) from energy_reading r join energy_zone z on z.id = r.zone_id
				 where z.energy_site_id = ? and z.code = 'Z-R61' and r.start >= ? and r.start < ?`,
				[
					siteId,
					midnight.subtract({ days: 1 }).epochMilliseconds / 1000,
					midnight.epochMilliseconds / 1000,
				],
			);
			// A day of quarter hours (Amsterdam's days are 24 hours but on the clocks' changes).
			expect(Number(yesterday)).toBeGreaterThanOrEqual(92);

			await bar.getByRole("button", { name: "Pause" }).click();
			await expect.poll(() => bar.getAttribute("data-running")).toBe("false");
			await expect.poll(() => state.textContent()).toContain("paused");
			expect(await running()).toBe(0);
			// The manager's changes are in the log, the ticks aren't.
			expect(
				Number(
					await value(
						`select count(*) from activity where organization_id = ? and subject_type = 'simulation'`,
						[shltr.id],
					),
				),
			).toBeGreaterThanOrEqual(4);
		} finally {
			await page.context().close();
		}
	});

	test("a planner sees its state, but can't drive it", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		const { siteId } = await riedel();
		try {
			await page.goto(new URL(`/energy/${siteId}`, page.url()).href);
			const bar = page.locator('[data-simulation="energy"]');
			await bar.waitFor();
			expect(await bar.locator("[data-simulation-state]").textContent()).toContain("paused");
			expect(await bar.getByRole("button").count()).toBe(0);

			const played = await app.expectingErrors(() =>
				callCommand(page, commands.playSimulation, [{ module: 1, running: 2 }, "energy", true]),
			);
			expect(played).toMatchObject({ type: "error", error: { status: 403 } });
			expect(await running()).toBe(0);
		} finally {
			await page.context().close();
		}
	});

	test("isn't on the page of a tenant offered none", async () => {
		const { page } = await signedInPage(app, shltrOwner);
		const { siteId } = await riedel();
		// This file's own change, put back after it: SHLTR without its energy simulation, as a
		// real tenant is.
		const [row] = await fixture<Record<string, InValue>>(
			`delete from simulation where organization_id = ? and module_id = 'energy' returning *`,
			[shltr.id],
		);
		try {
			await page.goto(new URL(`/energy/${siteId}`, page.url()).href);
			await page.locator("[data-building]").waitFor();
			await page.locator('[data-hero-chip="state"]').waitFor();
			expect(await page.locator("[data-simulation]").count()).toBe(0);
			expect(await page.locator('[data-hero-chip="state"]').textContent()).toMatch(
				/Live|No recent readings/,
			);
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
			await page.context().close();
		}
	});
});
