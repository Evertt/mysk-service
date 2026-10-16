import { type App, rows, organizations, value } from "#e2e/app.ts";
import { covered } from "#e2e/contracts-helpers.ts";

const { north } = organizations;

export const year = new Date().getFullYear();

export const contractId = (number: string, organizationId: string) =>
	value<number>(`select id from contract where number = ? and organization_id = ?`, [
		number,
		organizationId,
	]);

/** Locators on the app's current page. */
export function pageLocators(app: App) {
	return {
		sidebar: () => app.page.locator('[data-sidebar="content"]').innerText(),
		units: () => app.page.locator('input[name^="equipmentIds"]'),
		tableRows: () => app.page.locator('[data-slot="data-table"] tbody tr'),
		/** A card on the page, by its title. */
		card: (title: string) =>
			app.page.locator('main [data-slot="card"]', {
				has: app.page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
			}),
	};
}

/** A North customer without contracts that owns at least two units. */
export const customerWithoutContracts = () =>
	value<number>(
		`select c.id from customer c where c.organization_id = ?
		 and not exists (select 1 from contract k where k.customer_id = c.id)
		 and (select count(*) from equipment e where e.customer_id = c.id) >= 2 order by c.id limit 1`,
		[north.id],
	);

/** A North contract that is active today, one of its units, and its customer. */
export interface ActiveContract {
	id: number;
	number: string;
	customer_id: number;
	equipment_id: number;
}

export const activeContract = async () =>
	(
		await rows<ActiveContract>(
			`select k.id, k.number, k.customer_id, ce.equipment_id from contract k
			 join contract_equipment ce on ce.contract_id = k.id where k.organization_id = ?
			 and k.starts_on <= date('now', 'localtime') and k.ends_on >= date('now', 'localtime') order by k.id limit 1`,
			[north.id],
		)
	)[0];

// --- What contracts mean for orders, as `coverage.ts` defines it -------------------------------

export interface CallOut {
	number: string;
	contract: string;
	level: string;
	response_hours: number;
	/** In seconds, like the database's timestamps. */
	due: number;
}

/** North's covered breakdowns and repairs waiting to be scheduled, by deadline. */
export const callOuts = () =>
	rows<CallOut>(
		`with ${covered} select o.number, c.number as contract, c.level, c.response_hours,
		 o.created_at + c.response_hours * 3600 as due
		 from "order" o join covered c on c.order_id = o.id and c.n = 1
		 where o.organization_id = ? and o.type in ('breakdown', 'repair') and o.status = 'quote'
		 order by due, o.number`,
		[north.id],
	);

/** Overdue from the deadline on; at risk with less than a quarter of the response time left. */
export function slaOf(callOut: CallOut, now = Date.now() / 1000) {
	const left = callOut.due - now;
	if (left <= 0) return "overdue";
	return left < callOut.response_hours * 3600 * 0.25 ? "at_risk" : "on_track";
}
