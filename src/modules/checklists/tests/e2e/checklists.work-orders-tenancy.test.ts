/**
 * The work orders page between tenants: North (which has the module) lists only its own assets and
 * can't open, start or fill in SHLTR's, also by tampered queries and commands; South (which
 * hasn't) has no entry or page, and North's queries are refused.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	isRemote,
	organizations,
	rows,
	tamperWithCommand,
	tamperWithQuery,
	useApp,
	value,
} from "#e2e/app.ts";

import { assetLocators, assetStates, pageLocators, thisYear } from "./helpers.ts";

const { north, south } = organizations;
const shltr = organizations.shltr;
const app = useApp();
const page = () => app.page;
const { list, panel, listed, listCount, searchFor } = assetLocators(app);
const { sidebarLinks } = pageLocators(app);

/** The URLs of North's remote queries of the page, as loaded in North, to try from South. */
const queries: Record<string, string> = {};
const names = ["getAsset", "getAssetFacets", "getAssets"];

/** SHLTR's checklists, their points and its orders as they are, to see they stay so. */
const shltrState = async () => ({
	checklists: await rows(`select * from checklist where organization_id = ? order by id`, [
		shltr.id,
	]),
	results: await rows(
		`select id, result, remark from checklist_result where organization_id = ? order by id`,
		[shltr.id],
	),
	orders: await value(`select count(*) from "order" where organization_id = ?`, [shltr.id]),
});

/** A unit of SHLTR's with a draft on an open order: its serial number, checklist and a point. */
const shltrDraft = async () =>
	(
		await rows<{ serial: string; checklist: number; point: number }>(
			`select e.serial_number as serial, c.id as checklist, min(r.id) as point from checklist c
			 join "order" o on o.id = c.order_id join equipment e on e.id = c.equipment_id
			 join checklist_result r on r.checklist_id = c.id
			 where c.organization_id = ? and c.status = 'draft'
			 and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by c.id limit 1`,
			[shltr.id],
		)
	)[0];

/** Waits for the next answer of the remote function `name`, and answers its text. */
const answerOf = (name: string) =>
	page()
		.waitForResponse((response) => isRemote(response.url(), name))
		.then((response) => response.text());

describe("in North, which has the module", () => {
	let own: string;

	test("its page lists only its own assets, loaded by remote queries", async () => {
		const record = (request: { url(): string }) => {
			for (const name of names) if (isRemote(request.url(), name)) queries[name] = request.url();
		};
		page().on("request", record);
		await app.go("/activity");
		await page()
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Work orders" })
			.click();
		await page().waitForURL((url) => url.pathname === "/checklists");
		const states = await assetStates(north.id);
		expect(await listCount()).toBe(states.length);
		const ours = new Set(states.map((row) => row.serial_number));
		for (const serial of await listed()) expect(ours.has(serial), serial).toBe(true);
		// A unit of SHLTR's isn't found by its serial number.
		const { serial } = await shltrDraft();
		await searchFor(serial, 0);
		await searchFor("", states.length);
		own = (await listed())[0];
		await list().locator(`li[data-asset="${own}"] > a`).click();
		await panel().waitFor();
		page().off("request", record);
		expect(Object.keys(queries).toSorted()).toEqual(names);
	});

	test("SHLTR's unit and its components can't be read, also by a tampered query", async () => {
		const target = await shltrDraft();
		const [next] = (await listed()).filter((serial) => serial !== own);
		await app.expectingErrors(async () => {
			const answer = answerOf("getAsset");
			await tamperWithQuery<string>(page(), "getAsset", () => target.serial);
			await list().locator(`li[data-asset="${next}"] > a`).click();
			expect(await answer).toMatch(/"status":404/);
		});
		// SHLTR's component on North's unit: not one of its own, so the unit shows as a whole.
		const [part] = await rows<{ number: string; name: string }>(
			`select number, name from component where organization_id = ? limit 1`,
			[shltr.id],
		);
		await app.go(`/checklists?unit=${own}&component=${part.number}`);
		await panel().locator("[data-asset-history]").waitFor();
		expect(await panel().locator("[data-component-score]").count()).toBe(0);
		expect(await panel().innerText()).not.toContain(part.name);
	});

	test("SHLTR's can't be started or filled in, also by tampered commands", async () => {
		const target = await shltrDraft();
		const before = await shltrState();
		await app.go(`/checklists?unit=${own}`);
		await panel().waitFor();

		// Starting SHLTR's unit's inspection instead of North's.
		await app.expectingErrors(async () => {
			const answer = answerOf("startOrder");
			await tamperWithCommand<{ serialNumber: string }>(page(), "startOrder", (arg) => ({
				...arg,
				serialNumber: target.serial,
			}));
			await panel()
				.getByRole("button", { name: `Inspection ${thisYear}` })
				.click();
			expect(await answer).toMatch(/"status":404/);
		});

		// North's own, to have a draft to fill in.
		await panel()
			.getByRole("button", { name: `Inspection ${thisYear}` })
			.click();
		await app.toast("made: plan it in the schedule.");
		const card = page().locator('[data-office-checklist][data-status="draft"]');
		await card.waitFor();
		await app.expectingErrors(async () => {
			const answer = answerOf("officeAnswer");
			await tamperWithCommand<{ id: number }>(page(), "officeAnswer", (arg) => ({
				...arg,
				id: target.point,
			}));
			await card.locator("[data-point]").first().getByRole("button", { name: "OK" }).click();
			expect(await answer).toMatch(/"status":404/);
			// Taken back, and said so.
			await app.toast("Checklist not found");
		});
		for (const row of await card.locator("[data-point]").all()) {
			await row.getByRole("button", { name: "OK" }).click();
		}
		await app.expectingErrors(async () => {
			const answer = answerOf("officeComplete");
			await tamperWithCommand<{ id: number }>(page(), "officeComplete", () => ({
				id: target.checklist,
			}));
			await card.getByRole("button", { name: "Complete and record" }).click();
			expect(await answer).toMatch(/"status":404/);
		});
		expect(await shltrState()).toEqual(before);
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no entry, and the page is a 404", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Work orders");
		const response = await app.go("/checklists");
		expect(response?.status()).toBe(404);
	});

	test("North's remote queries are refused", async () => {
		expect(Object.keys(queries)).toHaveLength(names.length);
		for (const [name, url] of Object.entries(queries)) {
			const response = await page().context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), `${name}: ${body}`).toBe(true);
		}
	});
});
