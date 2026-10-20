/**
 * The work orders page ("Werkbonnen") in SHLTR's office: the sidebar opens it; its list of assets
 * with this year's badges, loading more as it scrolls, its filters in the URL; a unit's checklist
 * of this year with its history, and a component's points, score and scores; "Inspection 2026"
 * makes an order with its checklist (a second press opens it); the office fills it in and
 * completes it for the engineer, final afterwards; the templates are a click away; and on a phone
 * it stacks without scrolling sideways. What the server does for it (the list's search, filters and
 * states, starting an order, the office's filling in and the scores it records, another tenant's
 * ids refused) is `work-orders.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, useApp, users, value } from "#e2e/app.ts";

import { assetLocators, assetStates, resultsOf, thisYear } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrPlanner });
const page = () => app.page;
const { list, panel, checklistCard, listed, listCount, settledAt, searchFor } = assetLocators(app);

/** How many assets the list loads at a time. */
const PAGE = 40;

/** A unit's checklists, newest first by id. */
const checklistsOfUnit = (serial: string) =>
	rows<{ id: number; status: string; kind: string; order_id: number; completed_at: number | null }>(
		`select c.id, c.status, c.kind, c.order_id, c.completed_at from checklist c
		 join equipment e on e.id = c.equipment_id where e.serial_number = ? and e.organization_id = ?
		 order by c.id desc`,
		[serial, shltr.id],
	);

/**
 * A component, with points, of a unit that has a checklist this year: completed this year (without
 * an open draft), else a draft on an open order (early in the year, when none was completed yet).
 */
const withComponents = async () =>
	(
		await rows<{ serial: string; number: string; id: number }>(
			`select e.serial_number as serial, k.number, k.id from component k
			 join equipment e on e.id = k.equipment_id
			 where k.organization_id = ? and exists (select 1 from component_checkpoint cc
				where cc.component_id = k.id)
			 order by case
				when exists (select 1 from checklist c where c.equipment_id = e.id and c.status = 'draft')
					then 1
				when exists (select 1 from checklist c where c.equipment_id = e.id and c.status = 'completed'
					and strftime('%Y', c.completed_at, 'unixepoch', 'localtime') = ?) then 0
				else 2 end, k.number`,
			[shltr.id, String(thisYear)],
		)
	).find(Boolean)!;

describe("the list of assets", () => {
	test("the sidebar's Work orders opens the page, with every asset and this year's badges", async () => {
		await app.go("/");
		await page()
			.locator('[data-sidebar="content"]')
			.getByRole("link", { name: "Work orders" })
			.click();
		await page().waitForURL((url) => url.pathname === "/checklists");
		// The templates are a click away, and lead back.
		await page().getByRole("link", { name: "Templates" }).click();
		await page().waitForURL((url) => url.pathname === "/checklists/settings");
		await page().getByRole("heading", { name: "Checklist templates" }).first().waitFor();
		await page().locator("main").getByRole("link", { name: "Work orders" }).click();
		await page().waitForURL((url) => url.pathname === "/checklists");
		await page().getByRole("heading", { name: "Digital checkpoint work order" }).waitFor();
		const states = await assetStates(shltr.id);
		expect(await listCount()).toBe(states.length);
		// Each shown has this year's badge as it stands.
		const stateOf = new Map(states.map((row) => [row.serial_number, row.state]));
		const badges = await list()
			.locator("li[data-asset]")
			.evaluateAll((items: HTMLElement[]) =>
				items.map((item) => [
					item.dataset.asset!,
					item.querySelector("[data-year-state]")?.textContent?.trim() ?? null,
				]),
			);
		expect(badges.length).toBeGreaterThan(10);
		const badgeOf = { done: `${thisYear} ✓`, open: `${thisYear} open`, none: null };
		for (const [serial, badge] of badges) {
			expect(badge, serial!).toBe(badgeOf[stateOf.get(serial!) as keyof typeof badgeOf]);
		}
		// The filters' counts.
		const count = (state: string) => states.filter((row) => row.state === state).length;
		expect(await list().locator('[data-chip="open"]').innerText()).toContain(String(count("open")));
	});

	test("loads more as it scrolls", async () => {
		const first = (await listed()).length;
		expect(first).toBe(PAGE);
		await list()
			.locator("[data-asset-scroll]")
			.evaluate((element) => {
				element.scrollTop = element.scrollHeight;
			});
		await page().waitForFunction(
			(count) => document.querySelectorAll("li[data-asset]").length > count,
			first,
		);
	});

	test("keeps to a customer and to where they stand this year", async () => {
		const states = await assetStates(shltr.id);
		await list().locator('[data-chip="open"]').click();
		await page().waitForURL((url) => url.searchParams.get("year") === "open");
		const open = states.filter((row) => row.state === "open");
		await settledAt(open.length);
		// Its first page, all of them open (early in the year, when little is done yet, there are
		// more than a page of them).
		const shown = await listed();
		expect(shown).toHaveLength(Math.min(open.length, PAGE));
		expect(open.map((row) => row.serial_number)).toEqual(expect.arrayContaining(shown));
		await list().locator('[data-chip="all"]').click();
		await settledAt(states.length);

		const [riedel] = await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? and name like 'Riedel%'`,
			[shltr.id],
		);
		await list().getByRole("combobox", { name: "Customer" }).selectOption(riedel.code);
		await page().waitForURL((url) => url.searchParams.get("customer") === riedel.code);
		await settledAt(states.filter((row) => row.customer_id === riedel.id).length);
		await list().getByRole("combobox", { name: "Customer" }).selectOption("");
		await settledAt(states.length);
	});
});

describe("an asset", () => {
	test("a unit shows its checklist of this year and its history; the selection is in the URL", async () => {
		const { serial } = await withComponents();
		await searchFor(serial, 1);
		await list().locator(`li[data-asset="${serial}"] > a`).click();
		await page().waitForURL((url) => url.searchParams.get("unit") === serial);
		await panel().waitFor();
		const checklists = await checklistsOfUnit(serial);
		const draft = checklists.find((checklist) => checklist.status === "draft");
		const card = checklistCard();
		await card.waitFor();
		if (!draft) {
			const latest = checklists
				.filter((checklist) => checklist.status === "completed")
				.toSorted((a, b) => b.completed_at! - a.completed_at!)[0];
			expect(await card.getAttribute("data-office-checklist")).toBe(String(latest.id));
			expect(await card.locator("[data-completed-by]").innerText()).toMatch(/^Completed by /);
		}
		expect(await panel().locator("[data-asset-history] [data-history]").count()).toBe(
			checklists.length,
		);
		// From its history: another of its checklists, in the URL.
		const older = panel().locator("[data-asset-history] [data-history]").last();
		const id = new URL((await older.getAttribute("href"))!, page().url()).searchParams.get(
			"checklist",
		);
		expect(checklists.map((checklist) => String(checklist.id))).toContain(id);
		await older.click();
		await page().waitForURL((url) => url.searchParams.get("checklist") === id);
		await page().locator(`[data-office-checklist="${id}"]`).waitFor();
		expect(await older.getAttribute("aria-current")).toBe("true");
		// Back to the one of this year.
		await page().goBack();
		await page().waitForURL((url) => !url.searchParams.has("checklist"));
		await checklistCard().waitFor();
	});

	test("a component shows only its points, with the score they give it, and its scores", async () => {
		const part = await withComponents();
		await list().locator(`a[data-component="${part.number}"]`).click();
		await page().waitForURL((url) => url.searchParams.get("component") === part.number);
		const card = checklistCard();
		await card.locator("[data-component-score]").waitFor();
		const id = Number(await card.getAttribute("data-office-checklist"));
		const items = (
			await rows<{ template_item_id: number }>(
				`select template_item_id from component_checkpoint where component_id = ?`,
				[part.id],
			)
		).map((row) => row.template_item_id);
		const all = await rows<{ result: string | null; template_item_id: number | null }>(
			`select result, template_item_id from checklist_result where checklist_id = ?`,
			[id],
		);
		const own = all.filter((point) => items.includes(point.template_item_id!));
		// (A completed checklist's points are a list, a draft's the fields to answer them.)
		expect(await card.locator("[data-point]").count()).toBe(own.length);
		expect(await card.locator("[data-other-points]").innerText()).toMatch(
			new RegExp(`^${all.length - own.length} other points? of this unit (is|are) hidden$`),
		);
		const ok = own.filter((point) => point.result === "ok").length;
		const counted = ok + own.filter((point) => point.result === "nok").length;
		const score = counted ? `${Math.round((100 * ok) / counted)}%` : "No score";
		expect(await card.locator("[data-component-score]").innerText()).toContain(score);
		// Its own history: its scores.
		const scores = Number(
			await value(`select count(*) from unit_condition where component_id = ?`, [part.id]),
		);
		expect(await panel().locator("[data-score-entry]").count()).toBe(scores);
		// Back: the unit as a whole.
		await page().goBack();
		await page().waitForURL((url) => !url.searchParams.has("component"));
		await panel().locator("[data-asset-history] [data-history]").first().waitFor();
	});
});

describe("starting and filling in a unit's inspection", () => {
	let serial: string;
	let order: { id: number; number: string };

	test("Inspection 2026 makes an inspection order with its checklist, ready to plan", async () => {
		// A door whose template is short, without checklists or open orders.
		serial = await value<string>(
			`select e.serial_number from equipment e
			 join checklist_template_category tc on tc.category_id = e.category_id
			 join checklist_template t on t.id = tc.template_id and t.name = 'Algemene inspectie'
			 where e.organization_id = ? and e.status != 'decommissioned'
			 and not exists (select 1 from checklist c where c.equipment_id = e.id)
			 and not exists (select 1 from order_unit u join "order" o on o.id = u.order_id
				where u.equipment_id = e.id and o.status in ('quote', 'scheduled', 'in_progress'))
			 order by e.id limit 1`,
			[shltr.id],
		);
		await searchFor(serial, 1);
		await list().locator(`li[data-asset="${serial}"] > a`).click();
		await panel().locator("[data-asset-notice]").waitFor();
		expect(await panel().locator("[data-asset-notice]").innerText()).toBe(
			`No work order filled in for ${thisYear} yet. Start a new checklist.`,
		);
		await panel()
			.getByRole("button", { name: `Inspection ${thisYear}` })
			.click();
		await app.toast("made: plan it in the schedule.");
		await page().waitForURL((url) => url.searchParams.has("checklist"));

		[order] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o join order_unit u on u.order_id = o.id
			 join equipment e on e.id = u.equipment_id where e.serial_number = ? order by o.id desc limit 1`,
			[serial],
		);
		// Its checklist, shown to fill in.
		const [made] = await checklistsOfUnit(serial);
		const card = page().locator(`[data-office-checklist="${made.id}"]`);
		await card.waitFor();
		expect(await card.getAttribute("data-status")).toBe("draft");
		expect(await card.locator("[data-checklist-order]").innerText()).toBe(`Order ${order.number}`);
		expect(await list().locator(`li[data-asset="${serial}"] [data-year-state]`).innerText()).toBe(
			`${thisYear} open`,
		);
	});

	test("a second press opens the order it has", async () => {
		await panel()
			.getByRole("button", { name: `Inspection ${thisYear}` })
			.click();
		await app.toast(`${order.number} is open already`);
		// Its one checklist, still to fill in.
		expect(await page().locator("[data-office-checklist]").getAttribute("data-status")).toBe(
			"draft",
		);
	});

	test("the office fills it in for the engineer, by the portal's rules, and completes it", async () => {
		const [made] = await checklistsOfUnit(serial);
		const card = page().locator(`[data-office-checklist="${made.id}"]`);
		const points = await resultsOf(made.id);
		const pointRow = (text: string) => card.locator(`[data-point="${text}"]`);
		for (const point of points.slice(1)) {
			await pointRow(point.text).getByRole("button", { name: "OK" }).click();
		}
		await pointRow(points[0].text).getByRole("button", { name: "Reject" }).click();
		expect(await card.locator("[data-progress]").innerText()).toBe(
			`${points.length}/${points.length} points`,
		);
		await card.getByRole("button", { name: "Complete and record" }).click();
		expect(await card.locator("[data-save-state]").innerText()).toBe(
			"1 rejected point doesn't say what's wrong.",
		);
		await pointRow(points[0].text).getByRole("textbox").fill("Deurdranger lekt olie.");
		await card
			.getByRole("textbox", { name: "General remark and advice for the customer" })
			.fill("Deurdranger vervangen.");
		await card.getByRole("button", { name: "Complete and record" }).click();
		await app.toast("Checklist of");
		await page().locator(`[data-office-checklist="${made.id}"][data-status="completed"]`).waitFor();
		// Final: what was found and who completed it, in the office; nothing to answer.
		const completed = page().locator(`[data-office-checklist="${made.id}"]`);
		expect(await completed.locator("[data-completed-by]").innerText()).toMatch(
			/^Completed by Jan Weggemans \(office\) on /,
		);
		expect(await completed.getByRole("button", { name: "OK" }).count()).toBe(0);
		expect(await list().locator(`li[data-asset="${serial}"] [data-year-state]`).innerText()).toBe(
			`${thisYear} ✓`,
		);
		// The order's page says so too.
		await app.go(`/orders/${order.number}`);
		await page().locator("[data-order-checklists]").waitFor();
		expect(await page().locator("[data-order-checklists]").innerText()).toContain(
			"Jan Weggemans (office)",
		);
	});
});

describe("around the page", () => {
	test("on a phone, the list and the asset stack, without scrolling sideways", async () => {
		const { serial } = await withComponents();
		await onPhone(page(), async () => {
			await app.go(`/checklists?unit=${serial}`);
			await checklistCard().waitFor();
			expect(await fitsWidth(page())).toBe(true);
			const listBox = (await list().boundingBox())!;
			const panelBox = (await panel().boundingBox())!;
			expect(panelBox.y).toBeGreaterThan(listBox.y + listBox.height - 1);
		});
	});
});
