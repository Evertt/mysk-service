import type { InspectionStatus } from "#modules/checklists/api/extensions.ts";
/**
 * What the condition module's harness specs share: each unit's and component's facts as stored in
 * the spec file's database, with their status worked out from them by the module's pure rules
 * (`rolledUpStatus()`, `componentStatus()`), so what the server works out in SQL is checked against
 * a second way of getting there (as the e2e tests' `helpers.ts` does for the pages).
 */
import {
	type Concern,
	componentStatus,
	defaultThresholds,
	rolledUpStatus,
	type Thresholds,
	type UnitStatus,
} from "#modules/condition/model.ts";
import { rows } from "#unit/lib/server/harness/index.ts";

/** Today, in the seed's (and the visitors') time zone. */
const today = () => Temporal.Now.plainDateISO("Europe/Amsterdam");

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

/** A unit with its status (its components' taken in), as the rules work it out. */
interface UnitState {
	id: number;
	serial: string;
	customer: string;
	customerName: string;
	score: number | null;
	status: UnitStatus;
	concern: Concern;
	components: ComponentState[];
}

/** The tenant's thresholds, as stored (the defaults until its settings are first read). */
async function thresholdsOf(organizationId: string): Promise<Thresholds> {
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
		customer: string;
		customer_name: string;
		score: number | null;
		advice: string | null;
		planned: number;
		valid_until: string | null;
		rejected: number | null;
	}>(
		`select e.id, e.serial_number as serial, c.code as customer, c.name as customer_name,
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
		let inspection: InspectionStatus = "none";
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
			customer: unit.customer,
			customerName: unit.customer_name,
			score: unit.score,
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
interface RowState {
	unit: UnitState;
	component: ComponentState | null;
	score: number | null;
	status: UnitStatus;
}

/** The Connect page's rows of `units`: their components, and those without components themselves. */
export const rowsOf = (units: UnitState[]): RowState[] =>
	units.flatMap((unit): RowState[] =>
		unit.components.length
			? unit.components.map((part) => ({
					unit,
					component: part,
					score: part.score,
					status: part.status,
				}))
			: [{ unit, component: null, score: unit.score, status: unit.status }],
	);

/** How many of `units` (or rows) have each status. */
export const countsOf = (units: { status: UnitStatus }[]) =>
	Object.fromEntries(
		(["critical", "attention", "planned", "ok"] as const).flatMap((status) => {
			const count = units.filter((unit) => unit.status === status).length;
			return count ? [[status, count]] : [];
		}),
	);

/** Statuses worst first, as the Connect page sorts them. */
export const rank: Record<UnitStatus, number> = { critical: 0, attention: 1, planned: 2, ok: 3 };
