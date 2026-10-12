/** What the maintenance module's end-to-end tests share: days, plans as stored, and the page's parts. */
import { type App, rows, value } from "#e2e/app.ts";

/** Today, the machine's (which is the test server's). */
export const today = Temporal.Now.plainDateISO();

/** A day as a date input takes it, and as the database has it: `yyyy-mm-dd`. */
export const dayKey = (date: Temporal.PlainDate) => date.toString();
export const daysFromToday = (days: number) => today.add({ days });

/** A plan as stored. */
export interface Plan {
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

export const plansOf = (equipmentId: number) =>
	rows<Plan>(`select * from maintenance_plan where equipment_id = ? order by id`, [equipmentId]);

export const planById = async (id: number) =>
	(await rows<Plan>(`select * from maintenance_plan where id = ?`, [id]))[0];

/** A unit of the tenant's that's in use and has no plan yet. */
export const unitWithoutPlan = async (organizationId: string) =>
	(
		await rows<{ id: number; serial_number: string; customer_id: number }>(
			`select e.id, e.serial_number, e.customer_id from equipment e
			 where e.organization_id = ? and e.status != 'decommissioned'
			 and not exists (select 1 from maintenance_plan p where p.equipment_id = e.id)
			 order by e.id limit 1`,
			[organizationId],
		)
	)[0];

/** How many of the tenant's active plans are due before `before`. */
export const activeDueBefore = async (
	organizationId: string,
	before: Temporal.PlainDate,
	from?: Temporal.PlainDate,
) =>
	Number(
		await value(
			`select count(*) from maintenance_plan where organization_id = ? and paused = 0
			 and next_due_on < ? and next_due_on >= ?`,
			[organizationId, dayKey(before), from ? dayKey(from) : ""],
		),
	);

/** The activity entries about a plan after the entry `since`, oldest first. */
export const planActivity = (planId: number, since = 0) =>
	rows<{
		action: string;
		subject_label: string;
		parent_type: string | null;
		changes: string | null;
	}>(
		`select action, subject_label, parent_type, changes from activity
		 where subject_type = 'maintenancePlan' and subject_id = ? and id > ? order by id`,
		[String(planId), since],
	);

export const lastActivityId = async () =>
	Number(await value(`select coalesce(max(id), 0) from activity`));

/** The parts of the page the tests use. */
export function pageLocators(app: App) {
	const card = () => app.page.locator("[data-maintenance-plans]");
	const dialog = () => app.page.getByRole("dialog");
	/** The names of every link in the sidebar, in order. */
	const sidebarLinks = () =>
		app.page
			.locator('[data-sidebar="content"]')
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => link.textContent!.trim()));
	/** Opens the menu of the plan described as `description` on the unit's card. */
	const planMenu = (description: string) =>
		app.page.getByRole("button", { name: `Actions for ${description}`, exact: true }).click();
	const settingsCard = () => app.page.locator('[data-module="maintenance"]');
	return { card, dialog, sidebarLinks, planMenu, settingsCard };
}
