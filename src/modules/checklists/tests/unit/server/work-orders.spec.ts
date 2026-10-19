/**
 * The work orders page's remote functions on the seeded demo database, in SHLTR's office: the list
 * of assets with where each stands this year, its counts, searched by unit, serial number,
 * component and customer, and filtered by customer and this year's state; an asset with its
 * template, components and checklists, and a component's scores; "Inspection 2026" making an
 * order with its checklist (a second press opening it); the office filling one in for the engineer
 * and completing it, the condition module's hook scoring the unit and each component over its own
 * points; and North never listing, opening, starting or filling in SHLTR's, also by their ids. The
 * server side of `checklists.work-orders.test.ts` and `checklists.tenancy.test.ts`,
 * which keep the page (its badges, scrolling, selection in the URL, the phone) and one tampered
 * command. The office's fill rules in detail are `checklists.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { toListQuery } from "#lib/components/data-table/list-definition.ts";
import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
import { assetList } from "#modules/checklists/assets/asset-list.ts";
import {
	getAsset,
	getAssetFacets,
	getAssets,
	getComponentScores,
	officeAnswer,
	officeComplete,
	officeRemarkForCustomer,
	officeRemarkOn,
	startOrder,
} from "#modules/checklists/assets/assets.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	shltr,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

/** This year, in the seed's (and the visitors') time zone. */
const thisYear = Temporal.Now.plainDateISO("Europe/Amsterdam").year;

/** A year's first moment in Amsterdam, in seconds, as the database stores moments. */
const yearStart = (year: number) =>
	Temporal.PlainDate.from({ year, month: 1, day: 1 })
		.toZonedDateTime("Europe/Amsterdam")
		.toInstant().epochMilliseconds / 1000;

/**
 * An organization's units on the page (in service, with a template that's offered), with where
 * each stands this year, worked out in SQL apart from the app's: done once a checklist of it was
 * completed this year, else open with a draft on an open order, else none.
 */
const assetStates = (organization: string) =>
	rows<{ id: number; serial_number: string; customer_id: number; state: string }>(
		`select e.id, e.serial_number, e.customer_id, case
			when exists (select 1 from checklist c where c.equipment_id = e.id and c.status = 'completed'
				and c.completed_at >= ? and c.completed_at < ?) then 'done'
			when exists (select 1 from checklist c join "order" o on o.id = c.order_id
				where c.equipment_id = e.id and c.status = 'draft'
				and o.status in ('quote', 'scheduled', 'in_progress')) then 'open'
			else 'none' end as state
		 from equipment e
		 join checklist_template_category tc on tc.organization_id = e.organization_id
			and tc.category_id = e.category_id
		 join checklist_template t on t.id = tc.template_id and t.archived = 0
		 where e.organization_id = ? and e.status != 'decommissioned' order by e.id`,
		[yearStart(thisYear), yearStart(thisYear + 1), organization],
	);

/** The list's query of a link to the page with `search`. */
const queryOf = (search: string) =>
	toListQuery(assetList, parseTableUrl(new URLSearchParams(search), assetList.urlSpec));

/** The first page of the list a link with `search` opens, as `actor`. */
const listed = (search: string, actor: Actor = shltr.member) =>
	as(actor, () => data(getAssets, queryOf(search)));

/** Riedel, SHLTR's customer: its id and code. */
const riedel = async () =>
	(
		await rows<{ id: number; code: string; name: string }>(
			`select id, code, name from customer where organization_id = ? and name like 'Riedel%'`,
			[shltrId],
		)
	)[0];

/** A checklist's points as stored, in their order. */
const resultsOf = (checklistId: number) =>
	rows<{ id: number; text: string; result: string | null; template_item_id: number | null }>(
		`select id, text, result, template_item_id from checklist_result where checklist_id = ?
		 order by position`,
		[checklistId],
	);

describe("the list of assets, in SHLTR's office", () => {
	test("has every asset, a page at a time, each with where it stands this year", async () => {
		const states = await assetStates(shltrId);
		const { rows: shown, rowCount } = await listed("");
		expect(rowCount).toBe(states.length);
		expect(shown).toHaveLength(assetList.pageSize);
		const stateOf = new Map(states.map((row) => [row.serial_number, row.state]));
		for (const row of shown)
			expect(row.thisYear, row.serialNumber).toBe(stateOf.get(row.serialNumber));
		// By customer, then unit.
		const customers = shown.map((row) => row.customer.name);
		expect(customers).toEqual(customers.toSorted((a, b) => a.localeCompare(b)));
	});

	test("counts them by where they stand this year and by customer", async () => {
		const states = await assetStates(shltrId);
		const facets = await as(shltr.member, () => data(getAssetFacets, { q: "", filters: {} }));
		for (const state of ["done", "open", "none"]) {
			expect(facets.thisYear[state] ?? 0, state).toBe(
				states.filter((row) => row.state === state).length,
			);
		}
		const { id, code } = await riedel();
		expect(facets.customers.find((each) => each.code === code)?.count).toBe(
			states.filter((row) => row.customer_id === id).length,
		);
	});

	test("searches by unit, serial number, component and customer", async () => {
		const [part] = await rows<{ serial: string; number: string }>(
			`select e.serial_number as serial, k.number from component k join equipment e on e.id = k.equipment_id
			 where k.organization_id = ? and k.number = 'OC-4002'`,
			[shltrId],
		);
		expect((await listed(`q=${part.number}`)).rows.map((row) => row.serialNumber)).toEqual([
			part.serial,
		]);
		expect((await listed(`q=${part.serial}`)).rows.map((row) => row.serialNumber)).toEqual([
			part.serial,
		]);
		const customer = await riedel();
		const theirs = (await assetStates(shltrId)).filter((row) => row.customer_id === customer.id);
		expect((await listed(`q=${encodeURIComponent(customer.name)}`)).rowCount).toBe(theirs.length);
	});

	test("keeps to a customer, and to where they stand this year", async () => {
		const states = await assetStates(shltrId);
		const open = states.filter((row) => row.state === "open");
		const shownOpen = await listed("year=open");
		expect(shownOpen.rowCount).toBe(open.length);
		expect(new Set(shownOpen.rows.map((row) => row.thisYear))).toEqual(new Set(["open"]));
		const customer = await riedel();
		const theirs = states.filter((row) => row.customer_id === customer.id);
		expect((await listed(`customer=${customer.code}`)).rowCount).toBe(theirs.length);
		expect((await listed(`customer=${customer.code}&year=open`)).rowCount).toBe(
			theirs.filter((row) => row.state === "open").length,
		);
	});

	test("the chosen customer stays in the customer select with 0, when the year leaves none of theirs", async () => {
		const states = await assetStates(shltrId);
		const done = new Set(
			states.filter((row) => row.state === "done").map((row) => row.customer_id),
		);
		const idle = states.find((row) => !done.has(row.customer_id));
		expect(idle).toBeDefined();
		const code = await value<string>(`select code from customer where id = ?`, [idle!.customer_id]);
		const { q, filters } = queryOf(`customer=${code}&year=done`);
		const facets = await as(shltr.member, () => data(getAssetFacets, { q, filters }));
		expect(facets.customers.find((each) => each.code === code)).toMatchObject({ count: 0 });
		// Without it chosen, it isn't offered under that year.
		const { q: all, filters: year } = queryOf("year=done");
		const offered = await as(shltr.member, () => data(getAssetFacets, { q: all, filters: year }));
		expect(offered.customers.map((each) => each.code)).not.toContain(code);
	});
});

describe("an asset", () => {
	test("has its template, components and every checklist of it", async () => {
		const serial = await value<string>(
			`select e.serial_number from component k join equipment e on e.id = k.equipment_id
			 where k.organization_id = ? and k.number = 'OC-1041'`,
			[shltrId],
		);
		const asset = await as(shltr.member, () => data(getAsset, serial));
		expect(asset.unit.serialNumber).toBe(serial);
		expect(asset.template?.name).toBe("Sectionaaldeur");
		expect(asset.year).toBe(thisYear);
		expect(asset.components.map((part) => part.number)).toEqual(["OC-1041", "OC-1042"]);
		const checklists = Number(
			await value(
				`select count(*) from checklist c join equipment e on e.id = c.equipment_id
				 where e.serial_number = ? and e.organization_id = ?`,
				[serial, shltrId],
			),
		);
		expect(asset.checklists).toHaveLength(checklists);
		expect(await as(shltr.member, () => call(getAsset, "NO-SUCH-SERIAL"))).toMatchObject({
			status: 404,
		});
	});

	test("a component's scores, newest first; another unit's component is a 404", async () => {
		const [part] = await rows<{ id: number; serial: string }>(
			`select k.id, e.serial_number as serial from component k join equipment e on e.id = k.equipment_id
			 where k.organization_id = ? and k.number = 'OC-1043'`,
			[shltrId],
		);
		const scores = await as(shltr.member, () =>
			data(getComponentScores, { serialNumber: part.serial, componentId: part.id }),
		);
		const stored = await rows<{ id: number }>(
			`select id from unit_condition where component_id = ? order by recorded_at desc, id desc`,
			[part.id],
		);
		expect(scores.map((score) => score.id)).toEqual(stored.map((row) => row.id));
		const [other] = await rows<{ id: number }>(
			`select id from component where organization_id = ? and number = 'OC-1041'`,
			[shltrId],
		);
		expect(
			await as(shltr.member, () =>
				call(getComponentScores, { serialNumber: part.serial, componentId: other.id }),
			),
		).toMatchObject({ status: 404 });
	});
});

describe("starting a unit's inspection", () => {
	/** A door whose template is short, without checklists or open orders. */
	const freshDoor = () =>
		value<string>(
			`select e.serial_number from equipment e
			 join checklist_template_category tc on tc.category_id = e.category_id
			 join checklist_template t on t.id = tc.template_id and t.name = 'Algemene inspectie'
			 where e.organization_id = ? and e.status != 'decommissioned'
			 and not exists (select 1 from checklist c where c.equipment_id = e.id)
			 and not exists (select 1 from order_unit u join "order" o on o.id = u.order_id
				where u.equipment_id = e.id and o.status in ('quote', 'scheduled', 'in_progress'))
			 order by e.id limit 1`,
			[shltrId],
		);

	test("makes an inspection order with its checklist, ready to plan, logged; a second press opens it", async () => {
		const serial = await freshDoor();
		const orders = () =>
			value<number>(`select count(*) from "order" where organization_id = ?`, [shltrId]);
		const before = await orders();
		const started = await as(shltr.member, () =>
			call(startOrder, { serialNumber: serial, kind: "inspection" }),
		);
		expect(started).toMatchObject({ status: 200, data: { created: true } });
		const { number, checklistId } = started.data!;
		expect(await orders()).toBe(before + 1);
		const [made] = await rows<Record<string, unknown>>(
			`select id, type, status, engineer_id, scheduled_for, description from "order"
			 where organization_id = ? and number = ?`,
			[shltrId, number],
		);
		expect(made).toMatchObject({
			type: "inspection",
			status: "quote",
			engineer_id: null,
			scheduled_for: null,
			description: `Inspection ${thisYear}`,
		});
		expect(
			await value(
				`select count(*) from activity where subject_type = 'order' and subject_id = ? and action = 'created'`,
				[String(made.id)],
			),
		).toBe(1);
		expect(
			await rows(`select order_id, kind, status from checklist where id = ?`, [checklistId]),
		).toEqual([{ order_id: made.id, kind: "inspection", status: "draft" }]);
		const shown = await listed(`q=${serial}`);
		expect(shown.rows.map((row) => row.thisYear)).toEqual(["open"]);

		const again = await as(shltr.member, () =>
			call(startOrder, { serialNumber: serial, kind: "inspection" }),
		);
		expect(again).toMatchObject({ status: 200, data: { number, checklistId, created: false } });
		expect(await orders()).toBe(before + 1);
	});

	test("a unit without a template can't be started", async () => {
		// North's compressors have none.
		const serial = await value<string>(
			`select e.serial_number from equipment e where e.organization_id = ?
			 and not exists (select 1 from checklist_template_category tc where tc.category_id = e.category_id)
			 order by e.id limit 1`,
			[northId],
		);
		expect(serial).toBeDefined();
		expect(
			await as(north.member, () => call(startOrder, { serialNumber: serial, kind: "inspection" })),
		).toMatchObject({ status: 400 });
	});
});

describe("the office filling a checklist in for the engineer", () => {
	test("answers it by the portal's rules and completes it, the unit and its component scored", async () => {
		// Sectionaaldeur D-21's draft on a planned inspection, its component OC-4002 checked by a point.
		const [draft] = await rows<{
			id: number;
			order_id: number;
			equipment_id: number;
			serial: string;
		}>(
			`select c.id, c.order_id, c.equipment_id, e.serial_number as serial from checklist c
			 join equipment e on e.id = c.equipment_id join component k on k.equipment_id = e.id
			 where c.organization_id = ? and c.status = 'draft' and k.number = 'OC-4002'`,
			[shltrId],
		);
		const [part] = await rows<{ id: number; template_item_id: number }>(
			`select k.id, cc.template_item_id from component k
			 join component_checkpoint cc on cc.component_id = k.id where k.number = 'OC-4002'
			 and k.organization_id = ?`,
			[shltrId],
		);
		const points = await resultsOf(draft.id);
		const checked = points.find((point) => point.template_item_id === part.template_item_id)!;
		expect(checked, "a point of the draft checks OC-4002").toBeDefined();
		const jan = await value<string>(`select id from user where email = ?`, [shltr.member.email]);

		await as(shltr.member, async () => {
			for (const point of points) {
				const result = point.id === checked.id ? "nok" : "ok";
				expect(await call(officeAnswer, { id: point.id, result })).toMatchObject({ status: 200 });
			}
			expect(await call(officeComplete, { id: draft.id })).toMatchObject({
				status: 400,
				message: "1 rejected point doesn't say what's wrong.",
			});
			await call(officeRemarkOn, { id: checked.id, remark: "Aandrijving maakt geluid." });
			await call(officeRemarkForCustomer, { id: draft.id, remarks: "Aandrijving vervangen." });
			expect(await call(officeComplete, { id: draft.id })).toMatchObject({ status: 200 });
		});

		const [done] = await rows(
			`select status, completed_by, completed_by_user, remarks from checklist where id = ?`,
			[draft.id],
		);
		expect(done).toEqual({
			status: "completed",
			completed_by: null,
			completed_by_user: jan,
			remarks: "Aandrijving vervangen.",
		});
		// The scores, by the hook a completed checklist runs: the unit's from all its points, the
		// component's from its own, on the order, by the member.
		const scores = await rows<Record<string, unknown>>(
			`select component_id, score, source, order_id, engineer_id, user_id from unit_condition
			 where equipment_id = ? and order_id = ? order by component_id`,
			[draft.equipment_id, draft.order_id],
		);
		const by = { source: "checklist", order_id: draft.order_id, engineer_id: null, user_id: jan };
		expect(scores).toEqual([
			{
				component_id: null,
				score: Math.round((100 * (points.length - 1)) / points.length),
				...by,
			},
			{ component_id: part.id, score: 0, ...by },
		]);
		// Its scores, the newest first.
		const history = await as(shltr.member, () =>
			data(getComponentScores, { serialNumber: draft.serial, componentId: part.id }),
		);
		expect(history[0]).toMatchObject({ score: 0, source: "checklist" });
		// Final: it isn't changed any more, and the unit is done this year.
		expect(
			await as(shltr.member, () => call(officeAnswer, { id: checked.id, result: "ok" })),
		).toMatchObject({ status: 400 });
		expect((await listed(`q=${draft.serial}`)).rows.map((row) => row.thisYear)).toEqual(["done"]);
	});

	test("an engineer is refused the office's commands", async () => {
		const [point] = await rows<{ id: number }>(
			`select r.id from checklist_result r where r.organization_id = ? limit 1`,
			[shltrId],
		);
		expect(
			await as(shltr.engineer, () => call(officeAnswer, { id: point.id, result: "ok" })),
		).toMatchObject({ status: 403 });
	});
});

describe("SHLTR's assets, to North", () => {
	test("aren't listed, nor found by their serial numbers", async () => {
		const states = await assetStates(northId);
		const { rows: shown, rowCount } = await listed("", north.member);
		expect(rowCount).toBe(states.length);
		const ours = new Set(states.map((row) => row.serial_number));
		for (const row of shown) expect(ours.has(row.serialNumber), row.serialNumber).toBe(true);
		const [theirs] = await assetStates(shltrId);
		expect((await listed(`q=${theirs.serial_number}`, north.member)).rowCount).toBe(0);
	});

	test("are a 404 to open, start or fill in, also by their ids, and stay as they were", async () => {
		const [target] = await rows<{ serial: string; checklist: number; point: number }>(
			`select e.serial_number as serial, c.id as checklist, min(r.id) as point from checklist c
			 join "order" o on o.id = c.order_id join equipment e on e.id = c.equipment_id
			 join checklist_result r on r.checklist_id = c.id
			 where c.organization_id = ? and c.status = 'draft'
			 and o.status in ('quote', 'scheduled', 'in_progress')
			 group by c.id order by c.id limit 1`,
			[shltrId],
		);
		const [own] = await assetStates(northId);
		const [theirs] = await rows<{ id: number }>(
			`select id from component where organization_id = ? limit 1`,
			[shltrId],
		);
		const state = async () => ({
			checklists: await rows(`select * from checklist where organization_id = ? order by id`, [
				shltrId,
			]),
			results: await rows(
				`select id, result, remark from checklist_result where organization_id = ? order by id`,
				[shltrId],
			),
			orders: await value(`select count(*) from "order" where organization_id = ?`, [shltrId]),
		});
		const before = await state();
		await as(north.member, async () => {
			const answers = {
				getAsset: await call(getAsset, target.serial),
				getComponentScores: await call(getComponentScores, {
					serialNumber: target.serial,
					componentId: theirs.id,
				}),
				"its component on North's unit": await call(getComponentScores, {
					serialNumber: own.serial_number,
					componentId: theirs.id,
				}),
				startOrder: await call(startOrder, { serialNumber: target.serial, kind: "inspection" }),
				officeAnswer: await call(officeAnswer, { id: target.point, result: "ok" }),
				officeRemarkOn: await call(officeRemarkOn, { id: target.point, remark: "Overgenomen" }),
				officeRemarkForCustomer: await call(officeRemarkForCustomer, {
					id: target.checklist,
					remarks: "Overgenomen",
				}),
				officeComplete: await call(officeComplete, { id: target.checklist }),
			};
			for (const [name, answered] of Object.entries(answers)) {
				expect(answered.status, name).toBe(404);
			}
		});
		expect(await state()).toEqual(before);
	});
});
