/**
 * Maintenance plans on the server, on the seeded demo database: a unit's plans and their changes
 * (each logged against the unit), the due list (its ranges and search), turning due plans into
 * orders and moving them on (and that deleting the order later doesn't move a plan back), the
 * dashboard's counts, the equipment list's column, a contract's covered units, the settings, and
 * that North can't reach South's plans or units (the server side of `../../e2e/maintenance.test.ts`,
 * `maintenance.automatic.test.ts` and `maintenance.tenancy.test.ts`, which keep the pages and one
 * tampered form). The daily run is `automatic.spec.ts`'s.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getEquipmentList } from "#lib/equipment/list/equipment-list.remote.ts";
import { equipmentList } from "#lib/equipment/list/equipment-list.ts";
import { deleteOrder } from "#lib/orders/order.remote.ts";
import {
	createDueOrders,
	getDueCustomerOptions,
	getDueFacets,
	getDuePlans,
} from "#modules/maintenance/list/due-list.remote.ts";
import { advanceDueDate, SOON_DAYS } from "#modules/maintenance/model.ts";
import { getMaintenanceOverview } from "#modules/maintenance/overview.remote.ts";
import {
	addCoveredPlans,
	createPlan,
	deletePlan,
	getCoveredPlans,
	getUnitPlans,
	pausePlan,
	updatePlan,
} from "#modules/maintenance/plans.remote.ts";
import {
	getMaintenanceSettings,
	saveMaintenanceSettings,
} from "#modules/maintenance/settings.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

import { withModule } from "./support.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const today = Temporal.Now.plainDateISO("Europe/Amsterdam");
const day = (days: number) => today.add({ days }).toString();

/** A plan as stored. */
interface Plan {
	id: number;
	organization_id: string;
	equipment_id: number;
	order_type: string;
	description: string;
	interval_months: number;
	next_due_on: string;
	anchor_day: number;
	paused: number;
	last_order_id: number | null;
	last_order_organization_id: string | null;
}

const plansOf = (equipmentId: number) =>
	rows<Plan>(`select * from maintenance_plan where equipment_id = ? order by id`, [equipmentId]);
const planById = async (id: number) =>
	(await rows<Plan>(`select * from maintenance_plan where id = ?`, [id]))[0];

/** The log's entries about a plan after the entry `since`, oldest first. */
const planActivity = (planId: number, since = 0) =>
	rows<{
		action: string;
		subject_label: string;
		parent_type: string | null;
		parent_id: string | null;
		changes: string | null;
	}>(
		`select action, subject_label, parent_type, parent_id, changes from activity
		 where subject_type = 'maintenancePlan' and subject_id = ? and id > ? order by id`,
		[String(planId), since],
	);
const lastActivityId = async () => Number(await value(`select coalesce(max(id), 0) from activity`));
const changesOf = (entries: { action: string; changes: string | null }[]) =>
	entries.map((entry) => [entry.action, entry.changes && JSON.parse(entry.changes)]);

/** A unit of the tenant's that's in use and has no plan yet. */
const unitWithoutPlan = async (organization: string) =>
	(
		await rows<{ id: number; serial_number: string; customer_id: number }>(
			`select e.id, e.serial_number, e.customer_id from equipment e
			 where e.organization_id = ? and e.status != 'decommissioned'
			 and not exists (select 1 from maintenance_plan p where p.equipment_id = e.id)
			 order by e.id limit 1`,
			[organization],
		)
	)[0];

/** How many of North's active plans are due before `before` (and from `from`). */
const activeDueBefore = async (before: string, from = "") =>
	Number(
		await value(
			`select count(*) from maintenance_plan where organization_id = ? and paused = 0
			 and next_due_on < ? and next_due_on >= ?`,
			[northId, before, from],
		),
	);

/** A page of the due list as its table asks for it, filtered by `filters`. */
const dueQuery = (filters: Record<string, string[]>, q = "") =>
	({
		q,
		filters,
		sort: [{ id: "nextDue", desc: false }],
		group: null,
		pageIndex: 0,
		pageSize: 50,
	}) as Parameters<typeof getDuePlans>[0];

/** A plan's dialog as the page sends it. */
const planForm = (fields: {
	description: string;
	nextDueOn: string;
	intervalMonths?: number;
	orderType?: string;
}) => ({
	orderType: fields.orderType ?? "maintenance",
	description: fields.description,
	intervalMonths: fields.intervalMonths ?? 12,
	nextDueOn: fields.nextDueOn,
});

/** The unit this file gives a plan, and the plan. */
let unit: { id: number; serial_number: string; customer_id: number };
let plan: Plan;

describe("a unit's maintenance plans, in North", () => {
	test("a plan is added to the unit, and logged against it", async () => {
		unit = await unitWithoutPlan(northId);
		const since = await lastActivityId();
		const due = today.subtract({ days: 400 });
		const answer = await as(north.member, () =>
			submit(createPlan, {
				equipmentId: String(unit.id),
				...planForm({
					description: "Quarterly filter check",
					orderType: "inspection",
					intervalMonths: 3,
					nextDueOn: due.toString(),
				}),
			}),
		);
		expect(answer).toMatchObject({ status: 200, refreshed: ["getUnitPlans"] });
		[plan] = await plansOf(unit.id);
		expect(plan).toMatchObject({
			organization_id: northId,
			order_type: "inspection",
			description: "Quarterly filter check",
			interval_months: 3,
			next_due_on: due.toString(),
			anchor_day: due.day,
			paused: 0,
			last_order_id: null,
		});
		expect(await planActivity(plan.id, since)).toEqual([
			{
				action: "created",
				subject_label: `${unit.serial_number} · Quarterly filter check`,
				parent_type: "equipment",
				parent_id: String(unit.id),
				changes: null,
			},
		]);
		const { plans } = await as(north.member, () => data(getUnitPlans, unit.serial_number));
		expect(plans.map((each) => each.id)).toEqual([plan.id]);
	});

	test("it's edited, paused and resumed, each logged; a paused plan isn't due", async () => {
		const since = await lastActivityId();
		await as(north.member, async () => {
			expect(
				await submit(updatePlan, {
					id: String(plan.id),
					...planForm({
						description: "Quarterly filter change",
						orderType: "inspection",
						intervalMonths: 3,
						nextDueOn: plan.next_due_on,
					}),
				}),
			).toMatchObject({ status: 200 });
			expect(await call(pausePlan, { id: plan.id, paused: true })).toMatchObject({ status: 200 });
		});
		expect((await planById(plan.id)).paused).toBe(1);
		const due = await as(north.member, () => data(getDuePlans, dueQuery({}, unit.serial_number)));
		expect(due.rows).toEqual([]);
		await as(north.member, () => call(pausePlan, { id: plan.id, paused: false }));
		expect(changesOf(await planActivity(plan.id, since))).toEqual([
			["updated", { description: ["Quarterly filter check", "Quarterly filter change"] }],
			["updated", { paused: [false, true] }],
			["updated", { paused: [true, false] }],
		]);
		plan = await planById(plan.id);
	});

	test("a due date sets the day of the month its visits fall on", async () => {
		const due = today.with({ day: 31 }, { overflow: "constrain" }).add({ years: 1 });
		await as(north.member, () =>
			submit(updatePlan, {
				id: String(plan.id),
				...planForm({
					description: plan.description,
					orderType: "inspection",
					intervalMonths: 3,
					nextDueOn: due.toString(),
				}),
			}),
		);
		expect((await planById(plan.id)).anchor_day).toBe(due.day);
		// The day follows from the due date: not logged apart.
		const entry = (await planActivity(plan.id)).at(-1)!;
		expect(Object.keys(JSON.parse(entry.changes!))).toEqual(["nextDueOn"]);
		// Back as it was, long overdue, so it heads the due list.
		await as(north.member, () =>
			submit(updatePlan, {
				id: String(plan.id),
				...planForm({
					description: plan.description,
					orderType: "inspection",
					intervalMonths: 3,
					nextDueOn: plan.next_due_on,
				}),
			}),
		);
		plan = await planById(plan.id);
	});
});

describe("the due list, in North", () => {
	test("shows the active plans due within 30 days, the overdue ones, or all", async () => {
		await as(north.member, async () => {
			expect((await data(getDuePlans, dueQuery({ due: ["30-days"] }))).rowCount).toBe(
				await activeDueBefore(day(SOON_DAYS)),
			);
			expect((await data(getDuePlans, dueQuery({ due: ["90-days"] }))).rowCount).toBe(
				await activeDueBefore(day(90)),
			);
			const overdue = await data(getDuePlans, dueQuery({ due: ["overdue"] }));
			expect(overdue.rowCount).toBe(await activeDueBefore(day(0)));
			// The earliest first: ours, 400 days overdue.
			expect(overdue.rows[0].id).toBe(plan.id);
			expect((await data(getDuePlans, dueQuery({}))).rowCount).toBe(
				Number(
					await value(
						`select count(*) from maintenance_plan where organization_id = ? and paused = 0`,
						[northId],
					),
				),
			);
		});
	});

	test("finds a plan by its unit's serial number, and counts by type", async () => {
		await as(north.member, async () => {
			const found = await data(getDuePlans, dueQuery({}, unit.serial_number));
			expect(found.rows.map((row) => [row.id, row.description, row.intervalMonths])).toEqual([
				[plan.id, "Quarterly filter change", 3],
			]);
			const facets = await data(getDueFacets, { q: "", filters: { due: ["overdue"] } } as never);
			const inspections = Number(
				await value(
					`select count(*) from maintenance_plan where organization_id = ? and paused = 0
					 and next_due_on < ? and order_type = 'inspection'`,
					[northId, day(0)],
				),
			);
			expect(facets).toMatchObject({ type: expect.objectContaining({ inspection: inspections }) });
		});
	});

	test("the customer filter counts each customer's plans under the range, most first", async () => {
		await as(north.member, async () => {
			const options = await data(getDueCustomerOptions, {
				where: { q: "", filters: { due: ["overdue"] } },
				search: "",
				selected: [],
			} as never);
			const counts = options.options.map((option) => option.count ?? 0);
			expect(counts).toEqual(counts.toSorted((a, b) => b - a));
			const [top] = options.options;
			expect(top.count).toBeGreaterThan(0);
			expect(
				(await data(getDuePlans, dueQuery({ due: ["overdue"], customer: [top.value] }))).rowCount,
			).toBe(top.count);
			// Wider, more.
			const wider = await data(getDueCustomerOptions, {
				where: { q: "", filters: { due: ["90-days"] } },
				search: "",
				selected: [top.value],
			} as never);
			expect(wider.selected[0].count).toBeGreaterThanOrEqual(top.count!);
		});
	});

	test("makes an order for each selected plan, and moves each plan on one interval", async () => {
		const picked = await rows<Plan & { customer_id: number }>(
			`select p.*, e.customer_id from maintenance_plan p join equipment e on e.id = p.equipment_id
			 where p.organization_id = ? and p.paused = 0 and p.next_due_on < ?
			 order by p.next_due_on, p.id limit 2`,
			[northId, day(0)],
		);
		expect(picked[0].id).toBe(plan.id);
		const ordersBefore = Number(
			await value(`select coalesce(max(id), 0) from "order" where organization_id = ?`, [northId]),
		);
		const since = await lastActivityId();
		const answer = await as(north.member, () =>
			call(createDueOrders, { ids: picked.map((each) => each.id) }),
		);
		expect(answer).toMatchObject({ status: 200, data: { done: 2, skipped: [], missing: 0 } });

		const created = await rows<{
			id: number;
			number: string;
			customer_id: number;
			units: string;
			type: string;
			status: string;
			priority: string;
			description: string;
			engineer_id: number | null;
			scheduled_for: number | null;
		}>(
			`select id, number, customer_id, type, status, priority, description, engineer_id,
			 scheduled_for, (select group_concat(equipment_id) from order_unit where order_id = o.id)
			 as units from "order" o where organization_id = ? and id > ? order by id`,
			[northId, ordersBefore],
		);
		expect(created).toHaveLength(2);
		for (const was of picked) {
			const made = created.find((o) => o.units === String(was.equipment_id))!;
			expect(made).toMatchObject({
				customer_id: was.customer_id,
				type: was.order_type,
				description: was.description,
				status: "quote",
				priority: "normal",
				engineer_id: null,
				scheduled_for: null,
			});
			const next = advanceDueDate(
				Temporal.PlainDate.from(was.next_due_on),
				was.interval_months,
				was.anchor_day,
			);
			expect(await planById(was.id)).toMatchObject({
				next_due_on: next.toString(),
				last_order_id: made.id,
				last_order_organization_id: northId,
			});
			expect(changesOf(await planActivity(was.id, since))).toEqual([
				[
					"updated",
					{ nextDueOn: [was.next_due_on, next.toString()], lastOrder: [null, made.number] },
				],
			]);
			expect(
				await value(
					`select action from activity where subject_type = 'order' and subject_id = ? and id > ?`,
					[String(made.id), since],
				),
			).toBe("created");
		}
		plan = await planById(plan.id);
		// Ours was due 400 days ago, so it's still overdue after one quarter.
		expect(plan.next_due_on < day(0)).toBe(true);
	});

	test("skips a paused plan, with the reason", async () => {
		await as(north.member, () => call(pausePlan, { id: plan.id, paused: true }));
		const before = await planById(plan.id);
		expect(await as(north.member, () => call(createDueOrders, { ids: [plan.id] }))).toMatchObject({
			status: 200,
			data: {
				done: 0,
				skipped: [{ reason: `${unit.serial_number} · Quarterly filter change is paused` }],
			},
		});
		expect(await planById(plan.id)).toEqual(before);
		await as(north.member, () => call(pausePlan, { id: plan.id, paused: false }));
		plan = await planById(plan.id);
	});

	test("deleting the order later doesn't move the plan back", async () => {
		expect(
			await as(north.member, () => submit(deleteOrder, { id: String(plan.last_order_id) })),
		).toMatchObject({ status: 303 });
		expect(await planById(plan.id)).toMatchObject({
			next_due_on: plan.next_due_on,
			last_order_id: null,
			last_order_organization_id: null,
		});
	});
});

describe("the dashboard and the equipment list, in North", () => {
	test("the dashboard counts the plans overdue and due within 30 days", async () => {
		expect(await as(north.member, () => data(getMaintenanceOverview))).toEqual({
			overdue: await activeDueBefore(day(0)),
			soon: await activeDueBefore(day(SOON_DAYS), day(0)),
		});
	});

	/** The earliest due date of each unit's active plans, in SQL. */
	const nextDue = `(select min(p.next_due_on) from maintenance_plan p
		where p.equipment_id = e.id and p.paused = 0 and p.organization_id = e.organization_id)`;

	const equipmentQuery = (filters: Record<string, string[]>) =>
		({
			q: "",
			filters,
			sort: [{ id: "maintenance.nextDue", desc: false }],
			group: null,
			pageIndex: 0,
			pageSize: equipmentList.pageSize,
		}) as unknown as Parameters<typeof getEquipmentList>[0];

	test("the equipment list sorts by the next maintenance, and filters by it", async () => {
		const [first] = await rows<{ id: number; next: string }>(
			`select e.id, ${nextDue} as next from equipment e where e.organization_id = ?
			 and ${nextDue} is not null order by ${nextDue}, e.id limit 1`,
			[northId],
		);
		const count = async (where: string, args: string[] = []) =>
			Number(
				await value(`select count(*) from equipment e where e.organization_id = ? and ${where}`, [
					northId,
					...args,
				]),
			);
		await as(north.member, async () => {
			const sorted = await data(getEquipmentList, equipmentQuery({}));
			expect(sorted.rows[0].id).toBe(first.id);
			expect(String(sorted.rows[0].moduleValues["maintenance.nextDue"])).toBe(first.next);
			expect(
				(await data(getEquipmentList, equipmentQuery({ "maintenance.nextDue": ["overdue"] })))
					.rowCount,
			).toBe(await count(`${nextDue} < ?`, [day(0)]));
			expect(
				(await data(getEquipmentList, equipmentQuery({ "maintenance.nextDue": ["none"] })))
					.rowCount,
			).toBe(await count(`${nextDue} is null`));
		});
	});
});

describe("a contract's covered units, in North", () => {
	test("get a plan each where they have none, first due one interval from today", async () => {
		const [contract] = await rows<{ id: number }>(
			`select c.id from contract c where c.organization_id = ?
			 and exists (select 1 from contract_equipment ce where ce.contract_id = c.id
			   and not exists (select 1 from maintenance_plan p where p.equipment_id = ce.equipment_id))
			 order by c.id limit 1`,
			[northId],
		);
		const covered = await rows<{ id: number; plans: number }>(
			`select ce.equipment_id as id,
			 (select count(*) from maintenance_plan p where p.equipment_id = ce.equipment_id) as plans
			 from contract_equipment ce where ce.contract_id = ? order by ce.equipment_id`,
			[contract.id],
		);
		const ids = covered.map((each) => each.id);
		const without = covered.filter((each) => !each.plans);
		const before = await as(north.member, () => data(getCoveredPlans, ids));
		expect(before.without).toBe(without.length);

		const answer = await as(north.member, () =>
			submit(addCoveredPlans, {
				equipmentIds: ids.join(","),
				orderType: "maintenance",
				description: "Jaarlijkse servicebeurt",
				intervalMonths: 12,
			}),
		);
		expect(answer).toMatchObject({ status: 200, data: { added: without.length } });
		const due = advanceDueDate(today, 12).toString();
		for (const each of covered) {
			const plans = await plansOf(each.id);
			if (each.plans) {
				expect(plans).toHaveLength(each.plans);
				continue;
			}
			expect(plans).toEqual([
				expect.objectContaining({
					description: "Jaarlijkse servicebeurt",
					order_type: "maintenance",
					interval_months: 12,
					next_due_on: due,
				}),
			]);
		}
		expect((await as(north.member, () => data(getCoveredPlans, ids))).without).toBe(0);
	});
});

describe("the settings", () => {
	test("are a manager's to change, logged", async () => {
		const fields = { autoCreate: true, leadDays: 30, remindCustomers: false };
		expect(await as(north.member, () => submit(saveMaintenanceSettings, fields))).toMatchObject({
			status: 403,
		});
		expect(await as(north.owner, () => submit(saveMaintenanceSettings, fields))).toMatchObject({
			status: 303,
			location: "/maintenance",
		});
		expect(
			await rows(
				`select auto_create, lead_days, remind_customers from maintenance_settings
				 where organization_id = ?`,
				[northId],
			),
		).toEqual([{ auto_create: 1, lead_days: 30, remind_customers: 0 }]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where organization_id = ?
			 and subject_type = 'maintenance_settings' order by id desc limit 1`,
			[northId],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({ autoCreate: [false, true] });
	});
});

describe("North and South's plans", () => {
	/** A South unit, and a plan of South's on it (made with the module switched on). */
	let southUnit: { id: number; serial_number: string };
	let southPlan: Plan;

	beforeAll(async () => {
		[southUnit] = await rows<typeof southUnit>(
			`select id, serial_number from equipment e where organization_id = ? and not exists
			 (select 1 from equipment n where n.organization_id = ? and n.serial_number = e.serial_number)
			 order by id limit 1`,
			[southId, northId],
		);
		await withModule("south", "maintenance", () =>
			as(south.owner, () =>
				submit(createPlan, {
					equipmentId: String(southUnit.id),
					...planForm({ description: "Jaarlijks onderhoud", nextDueOn: day(5) }),
				}),
			),
		);
		[southPlan] = await plansOf(southUnit.id);
	});

	test("South's plans stay when the module is switched off, and are back when it's on", async () => {
		expect(southPlan).toMatchObject({ organization_id: southId, interval_months: 12 });
		expect(
			await rows(
				`select action from activity where organization_id = ? and subject_type = 'module'
				 and subject_id = 'maintenance' order by id`,
				[southId],
			),
		).toEqual([{ action: "module_enabled" }, { action: "module_disabled" }]);
		const { plans } = await withModule("south", "maintenance", () =>
			as(south.owner, () => data(getUnitPlans, southUnit.serial_number)),
		);
		expect(plans.map((each) => each.id)).toEqual([southPlan.id]);
	});

	test("North can't add a plan to South's unit, nor read its plans", async () => {
		await as(north.member, async () => {
			expect(
				await submit(createPlan, {
					equipmentId: String(southUnit.id),
					...planForm({ description: "Not ours", nextDueOn: day(10) }),
				}),
			).toMatchObject({ status: 404 });
			expect(await call(getUnitPlans, southUnit.serial_number)).toMatchObject({ status: 404 });
			expect(await data(getCoveredPlans, [southUnit.id])).toEqual({ units: [], without: 0 });
			expect(
				await submit(addCoveredPlans, {
					equipmentIds: String(southUnit.id),
					orderType: "maintenance",
					description: "Not ours",
					intervalMonths: 12,
				}),
			).toMatchObject({ status: 404 });
		});
		expect(await plansOf(southUnit.id)).toEqual([southPlan]);
	});

	test("North can't change South's plan by its id", async () => {
		const [own] = await rows<Plan>(
			`select * from maintenance_plan where organization_id = ? order by id limit 1`,
			[northId],
		);
		const id = String(southPlan.id);
		await as(north.member, async () => {
			const form = planForm({ description: "Taken over", nextDueOn: day(1) });
			expect(await submit(updatePlan, { id, ...form })).toMatchObject({ status: 404 });
			expect(await call(pausePlan, { id: southPlan.id, paused: true })).toMatchObject({
				status: 404,
			});
			expect(await submit(deletePlan, { id })).toMatchObject({ status: 404 });
			expect(await call(createDueOrders, { ids: [southPlan.id] })).toMatchObject({
				status: 200,
				data: { done: 0, missing: 1 },
			});
			// Nor do North's lists show it, nor its customer filter offer South's customers.
			expect((await data(getDuePlans, dueQuery({}, southUnit.serial_number))).rows).toEqual([]);
			const southOnly = await value<string>(
				`select name from customer where organization_id = ?
				 and name not in (select name from customer where organization_id = ?) order by id limit 1`,
				[southId, northId],
			);
			const options = await data(getDueCustomerOptions, {
				where: { q: "", filters: {} },
				search: southOnly,
				selected: [],
			} as never);
			expect(options.options).toEqual([]);
		});
		expect(await planById(southPlan.id)).toEqual(southPlan);
		expect(await planById(own.id)).toEqual(own);
		expect(
			await value(
				`select count(*) from activity where subject_type = 'maintenancePlan' and subject_id = ?`,
				[id],
			),
		).toBe(1);
	});

	test("a plan is deleted, logged, by its own tenant", async () => {
		await withModule("south", "maintenance", () =>
			as(south.owner, () => submit(deletePlan, { id: String(southPlan.id) })),
		);
		expect(await planById(southPlan.id)).toBeUndefined();
		expect((await planActivity(southPlan.id)).map((entry) => entry.action)).toEqual([
			"created",
			"deleted",
		]);
	});
});
