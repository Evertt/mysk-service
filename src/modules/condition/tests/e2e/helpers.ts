/**
 * What the condition module's end-to-end tests share: each unit's and component's facts as stored
 * and their status worked out from them with the module's pure rules (`rolledUpStatus()`,
 * `componentStatus()`), so the pages, which work it out in SQL, are checked against a second way of
 * getting there; and the pages' parts.
 */
import { type App, rows, value } from "#e2e/app.ts";
import {
	type Concern,
	componentStatus,
	defaultThresholds,
	type InspectionState,
	rolledUpStatus,
	type Thresholds,
	type UnitStatus,
} from "#modules/condition/model.ts";

/** Today, the machine's (which is the test server's). */
const today = () => Temporal.Now.plainDateISO();

/** How many days before its end an inspection counts as expiring (checklists' `EXPIRING_DAYS`). */
const EXPIRING_DAYS = 30;

/** A component of a unit in care with its status, as the rules work it out from what's stored. */
interface ComponentState {
	id: number;
	number: string;
	name: string;
	score: number | null;
	advice: string | null;
	status: UnitStatus;
	concern: Concern;
}

/** A unit in care with its status (its components' taken in), as the rules work it out. */
export interface UnitState {
	id: number;
	serial: string;
	name: string | null;
	customer: string;
	customerName: string;
	score: number | null;
	advice: string | null;
	status: UnitStatus;
	concern: Concern;
	components: ComponentState[];
}

/** The tenant's thresholds, as stored (the defaults until its settings are first read). */
export async function thresholdsOf(organizationId: string): Promise<Thresholds> {
	const [found] = await rows<{ critical_below: number; attention_below: number }>(
		`select critical_below, attention_below from condition_settings where organization_id = ?`,
		[organizationId],
	);
	return found
		? { critical: found.critical_below, attention: found.attention_below }
		: defaultThresholds;
}

/**
 * The tenant's units in care (all but the decommissioned, unless `all`, as the equipment list has
 * them), with their status.
 */
export async function unitStates(organizationId: string, all = false): Promise<UnitState[]> {
	const thresholds = await thresholdsOf(organizationId);
	const found = await rows<{
		id: number;
		serial: string;
		name: string | null;
		customer: string;
		customer_name: string;
		score: number | null;
		advice: string | null;
		planned: number;
		valid_until: string | null;
		rejected: number | null;
	}>(
		`select e.id, e.serial_number as serial, e.name, c.code as customer, c.name as customer_name,
			(select score from unit_condition u where u.equipment_id = e.id and u.component_id is null
			 order by u.recorded_at desc, u.id desc limit 1) as score,
			(select advice from unit_condition u where u.equipment_id = e.id and u.component_id is null
			 order by u.recorded_at desc, u.id desc limit 1) as advice,
			exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
			 where ou.equipment_id = e.id and o.status in ('scheduled', 'in_progress')) as planned,
			(select k.valid_until from checklist k where k.equipment_id = e.id and k.kind = 'inspection'
			 and k.status = 'completed' and k.valid_until is not null
			 order by k.completed_at desc, k.id desc limit 1) as valid_until,
			(select exists (select 1 from checklist_result r where r.checklist_id = k.id and r.result = 'nok')
			 from checklist k where k.equipment_id = e.id and k.kind = 'inspection'
			 and k.status = 'completed' and k.valid_until is not null
			 order by k.completed_at desc, k.id desc limit 1) as rejected
		 from equipment e join customer c on c.id = e.customer_id
		 where e.organization_id = ? and (? or e.status <> 'decommissioned') order by e.id`,
		[organizationId, all ? 1 : 0],
	);
	const parts = await rows<{
		id: number;
		equipment_id: number;
		number: string;
		name: string;
		score: number | null;
		advice: string | null;
	}>(
		`select c.id, c.equipment_id, c.number, c.name,
			(select score from unit_condition u where u.component_id = c.id
			 order by u.recorded_at desc, u.id desc limit 1) as score,
			(select advice from unit_condition u where u.component_id = c.id
			 order by u.recorded_at desc, u.id desc limit 1) as advice
		 from component c where c.organization_id = ? order by c.equipment_id, c.position, c.id`,
		[organizationId],
	);
	const day = today();
	return found.map((unit) => {
		let inspection: InspectionState = "none";
		if (unit.valid_until) {
			const until = Temporal.PlainDate.from(unit.valid_until);
			if (Temporal.PlainDate.compare(day, until) > 0) inspection = "expired";
			else if (unit.rejected) inspection = "rejected";
			else if (Temporal.PlainDate.compare(day, until.subtract({ days: EXPIRING_DAYS })) >= 0) {
				inspection = "expiring";
			} else inspection = "valid";
		}
		const facts = { score: unit.score, advice: unit.advice, inspection, planned: !!unit.planned };
		const own = parts.filter((part) => part.equipment_id === unit.id);
		const { status, concern } = rolledUpStatus(facts, own, thresholds);
		return {
			id: unit.id,
			serial: unit.serial,
			name: unit.name,
			customer: unit.customer,
			customerName: unit.customer_name,
			score: unit.score,
			advice: unit.advice,
			status,
			concern,
			components: own.map((part) => ({
				id: part.id,
				number: part.number,
				name: part.name,
				score: part.score,
				advice: part.advice,
				...componentStatus(part, facts, thresholds),
			})),
		};
	});
}

/** A row of the Connect page: a unit's component, or a unit without components. */
export interface RowState {
	unit: UnitState;
	component: ComponentState | null;
	score: number | null;
	advice: string | null;
	status: UnitStatus;
	concern: Concern;
}

/** The Connect page's rows of `units`: their components, and those without components themselves. */
export const rowsOf = (units: UnitState[]): RowState[] =>
	units.flatMap((unit): RowState[] =>
		unit.components.length
			? unit.components.map((part) => ({
					unit,
					component: part,
					score: part.score,
					advice: part.advice,
					status: part.status,
					concern: part.concern,
				}))
			: [
					{
						unit,
						component: null,
						score: unit.score,
						advice: unit.advice,
						status: unit.status,
						concern: unit.concern,
					},
				],
	);

/** A unit's components as stored, in their order. */
export const componentsOf = (equipmentId: number) =>
	rows<{
		id: number;
		organization_id: string;
		number: string;
		name: string;
		material_id: number | null;
		position: number;
	}>(
		`select id, organization_id, number, name, material_id, position from component
		 where equipment_id = ? order by position, id`,
		[equipmentId],
	);

/** The template points that check a component, by id. */
export const checkpointsOf = async (componentId: number) =>
	(
		await rows<{ template_item_id: number }>(
			`select template_item_id from component_checkpoint where component_id = ?
			 order by template_item_id`,
			[componentId],
		)
	).map((row) => row.template_item_id);

/** How many of `units` (or rows) have each status. */
export const countsOf = (units: { status: UnitStatus }[]) => ({
	units: units.length,
	critical: units.filter((unit) => unit.status === "critical").length,
	attention: units.filter((unit) => unit.status === "attention").length,
	planned: units.filter((unit) => unit.status === "planned").length,
	ok: units.filter((unit) => unit.status === "ok").length,
});

/** The type of a condition as stored. */
type StoredCondition = {
	id: number;
	organization_id: string;
	score: number;
	advice: string | null;
	source: string;
	order_id: number | null;
	engineer_id: number | null;
	user_id: string | null;
};

/** A component's conditions as stored, newest first. */
export const componentConditionsOf = (componentId: number) =>
	rows<StoredCondition>(
		`select id, organization_id, score, advice, source, order_id, engineer_id, user_id
		 from unit_condition where component_id = ? order by recorded_at desc, id desc`,
		[componentId],
	);

/** A unit's conditions as a whole as stored, newest first. */
export const conditionsOf = (equipmentId: number) =>
	rows<{
		id: number;
		organization_id: string;
		score: number;
		advice: string | null;
		source: string;
		order_id: number | null;
		engineer_id: number | null;
		user_id: string | null;
	}>(
		`select id, organization_id, score, advice, source, order_id, engineer_id, user_id
		 from unit_condition where equipment_id = ? and component_id is null
		 order by recorded_at desc, id desc`,
		[equipmentId],
	);

export const conditionCount = async () =>
	Number(await value(`select count(*) from unit_condition`));

/** The parts of the pages the tests use. */
export function pageLocators(app: App) {
	const page = () => app.page;
	/** A KPI tile's number, by its status (or `units`). */
	const kpi = async (status: "units" | UnitStatus) =>
		Number(
			(await page().locator(`[data-kpi="${status}"] [data-slot="card-title"]`).innerText()).replace(
				/\D/g,
				"",
			),
		);
	const kpis = async () => ({
		units: await kpi("units"),
		critical: await kpi("critical"),
		attention: await kpi("attention"),
		planned: await kpi("planned"),
		ok: await kpi("ok"),
	});
	/** The statuses of the rows loaded, in order. */
	const shownStatuses = () =>
		page()
			.locator('[data-slot="data-table"] tbody tr [data-status]')
			.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => cell.dataset.status!));
	const card = () => page().locator("[data-unit-condition]");
	const dialog = () => page().getByRole("dialog");
	/** The names of every link in the sidebar, in order. */
	const sidebarLinks = () =>
		page()
			.locator('[data-sidebar="content"]')
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => link.textContent!.trim()));
	return { kpi, kpis, shownStatuses, card, dialog, sidebarLinks };
}

/** Statuses worst first, as the Connect page sorts them. */
export const rank: Record<UnitStatus, number> = { critical: 0, attention: 1, planned: 2, ok: 3 };
