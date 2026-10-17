/** What the checklists module's end-to-end tests share: templates and points as stored, and the pages' parts. */
import type { Locator, Page } from "playwright";

import { type App, rows, value } from "#e2e/app.ts";

export interface Template {
	id: number;
	organization_id: string;
	name: string;
	norm: string | null;
	validity_months: number;
	position: number;
	archived: number;
}

export interface Point {
	id: number;
	template_id: number;
	group_name: string;
	text: string;
	position: number;
}

/** An organization's templates, in their order. */
export const templatesOf = (organizationId: string) =>
	rows<Template>(
		`select id, organization_id, name, norm, validity_months, position, archived
		 from checklist_template where organization_id = ? order by position, id`,
		[organizationId],
	);

export const templateNamed = async (organizationId: string, name: string) =>
	(await templatesOf(organizationId)).find((template) => template.name === name)!;

/** A template's points, in their order, as `group:text`. */
export const pointsOf = async (templateId: number) =>
	(
		await rows<Point>(
			`select id, template_id, group_name, text, position from checklist_template_item
			 where template_id = ? order by position, id`,
			[templateId],
		)
	).map((point) => `${point.group_name}:${point.text}`);

export const pointRows = (templateId: number) =>
	rows<Point>(
		`select id, template_id, group_name, text, position from checklist_template_item
		 where template_id = ? order by position, id`,
		[templateId],
	);

/** The names of the categories a template is for, by name. */
export const categoriesOf = async (templateId: number) =>
	(
		await rows<{ name: string }>(
			`select c.name from checklist_template_category tc
			 join equipment_category c on c.id = tc.category_id
			 where tc.template_id = ? order by c.name`,
			[templateId],
		)
	).map((row) => row.name);

/** What was logged about a template and its points, after the entry `since`, oldest first. */
export const templateActivity = (templateId: number, since = 0) =>
	rows<{
		action: string;
		subject_type: string;
		subject_label: string;
		parent_label: string | null;
		changes: string | null;
	}>(
		`select action, subject_type, subject_label, parent_label, changes from activity
		 where id > ? and ((subject_type = 'checklistTemplate' and subject_id = ?)
			or (parent_type = 'checklistTemplate' and parent_id = ?))
		 order by id`,
		[since, String(templateId), String(templateId)],
	);

export const lastActivityId = async () =>
	Number(await value(`select coalesce(max(id), 0) from activity`));

/** A unit of the organization's category `category`, by serial number. */
export const unitOf = async (organizationId: string, category: string) =>
	String(
		await value(
			`select e.serial_number from equipment e join equipment_category c on c.id = e.category_id
			 where e.organization_id = ? and c.name = ? order by e.id limit 1`,
			[organizationId, category],
		),
	);

/** The parts of the pages the tests use. */
export function pageLocators(app: App) {
	const page = () => app.page;
	const dialog = () => page().getByRole("dialog");
	const alert = () => page().getByRole("alertdialog");
	const templateRow = (name: string) => page().locator(`tr[data-template="${name}"]`);
	const gaps = () => page().locator("[data-checklist-gaps]");
	const pointsCard = () => page().locator("[data-checklist-points]");
	const categoriesCard = () => page().locator("[data-checklist-categories]");
	const categoryBox = (name: string) =>
		categoriesCard().locator(`[data-category="${name}"]`).getByRole("checkbox");
	const unitCard = () => page().locator("[data-checklist-template]");
	const settingsCard = () => page().locator('[data-module="checklists"]');
	/** The names of every link in the sidebar, in order. */
	const sidebarLinks = () =>
		page()
			.locator('[data-sidebar="content"]')
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => link.textContent!.trim()));
	/** The point texts shown, in order, as `group:text` (no group: an empty group). */
	const shownPoints = () =>
		pointsCard()
			.locator("section[data-group]")
			.evaluateAll((sections: HTMLElement[]) =>
				sections.flatMap((section) =>
					[...section.querySelectorAll("li[data-point] > span:nth-child(2)")].map(
						(span) => `${section.dataset.group}:${span.textContent!.trim()}`,
					),
				),
			);
	/** Opens point `number`'s menu and picks `item`. */
	const pointMenu = async (number: number, item: "Edit" | "Delete") => {
		await page()
			.getByRole("button", { name: `Actions for point ${number}`, exact: true })
			.click();
		await page().getByRole("menuitem", { name: item }).click();
	};
	/** Sets a hidden input of `scope` (a dialog, the page) whose name starts with `name`. */
	const tamper = (scope: Locator, name: string, to: number | string) =>
		scope
			.locator(`input[type="hidden"][name^="${name}"]`)
			.first()
			.evaluate((input: HTMLInputElement, v) => (input.value = String(v)), to);
	return {
		dialog,
		alert,
		templateRow,
		gaps,
		pointsCard,
		categoriesCard,
		categoryBox,
		unitCard,
		settingsCard,
		sidebarLinks,
		shownPoints,
		pointMenu,
		tamper,
	};
}

// --- Checklists on orders ---------------------------------------------------------------------

export interface ChecklistRow {
	id: number;
	order_id: number;
	equipment_id: number;
	serial_number: string;
	name: string;
	kind: string;
	status: string;
	remarks: string | null;
	completed_at: number | null;
	completed_by: number | null;
	valid_until: string | null;
}

/** An order's checklists, in its units' order. */
export const checklistsOfOrder = (orderId: number) =>
	rows<ChecklistRow>(
		`select c.id, c.order_id, c.equipment_id, e.serial_number, c.name, c.kind, c.status, c.remarks,
			c.completed_at, c.completed_by, c.valid_until
		 from checklist c join equipment e on e.id = c.equipment_id
		 join order_unit u on u.order_id = c.order_id and u.equipment_id = c.equipment_id
		 where c.order_id = ? order by u.position`,
		[orderId],
	);

export interface ResultRow {
	id: number;
	group_name: string;
	text: string;
	position: number;
	result: string | null;
	remark: string | null;
}

/** A checklist's points, in their order. */
export const resultsOf = (checklistId: number) =>
	rows<ResultRow>(
		`select id, group_name, text, position, result, remark from checklist_result
		 where checklist_id = ? order by position`,
		[checklistId],
	);

/** The id of the engineer `email`'s account is linked to, in `organizationId`. */
export const engineerOf = (email: string, organizationId: string) =>
	value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id
		 where u.email = ? and e.organization_id = ?`,
		[email, organizationId],
	);

/**
 * Each of an organization's units' inspection status `today` (`yyyy-mm-dd`), worked out in SQL as
 * the app does: by its latest completed inspection.
 */
export const inspectionStatuses = (organizationId: string, today: string, soon: string) =>
	rows<{ serial_number: string; status: string }>(
		`select e.serial_number, coalesce((
			select case when c.valid_until < ? then 'expired'
				when exists (select 1 from checklist_result r where r.checklist_id = c.id and r.result = 'nok')
					then 'rejected'
				when c.valid_until <= ? then 'expiring' else 'valid' end
			from checklist c where c.equipment_id = e.id and c.kind = 'inspection'
				and c.status = 'completed' and c.valid_until is not null
			order by c.completed_at desc, c.id desc limit 1), 'none') as status
		 from equipment e where e.organization_id = ? order by e.id`,
		[today, soon, organizationId],
	);

/** Draws a squiggle on a signature pad, as a finger would. */
export async function sign(page: Page, pad: Locator) {
	await pad.scrollIntoViewIfNeeded();
	const box = (await pad.boundingBox())!;
	await page.mouse.move(box.x + 20, box.y + box.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) {
		await page.mouse.move(box.x + 20 + i * 20, box.y + box.height / 2 + (i % 2 ? -25 : 25));
	}
	await page.mouse.up();
}

// --- The work orders page -----------------------------------------------------------------------

/** This year, on the machine running the tests (the server's and the browser's zone). */
export const thisYear = Temporal.Now.plainDateISO().year;

/** A year's first moment on the machine, in seconds, as the database stores moments. */
const yearStart = (year: number) =>
	Temporal.PlainDate.from({ year, month: 1, day: 1 })
		.toZonedDateTime(Temporal.Now.timeZoneId())
		.toInstant().epochMilliseconds / 1000;

/**
 * An organization's units on the work orders page (in service, with a template), with where each
 * stands this year, worked out in SQL as the app does: done once a checklist of it was completed
 * this year, else open with a draft on an open order, else none.
 */
export const assetStates = (organizationId: string) =>
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
		[yearStart(thisYear), yearStart(thisYear + 1), organizationId],
	);

/** The page's parts the tests use. */
export function assetLocators(app: App) {
	const page = () => app.page;
	const list = () => page().locator("[data-asset-list]");
	const panel = () => page().locator("[data-asset-panel]");
	const checklistCard = () => page().locator("[data-office-checklist]");
	/** The serial numbers the list shows, in order. */
	const listed = () =>
		list()
			.locator("li[data-asset]")
			.evaluateAll((items: HTMLElement[]) => items.map((item) => item.dataset.asset!));
	/** How many assets the list says match. */
	const listCount = async () =>
		Number((await list().locator("[data-asset-count]").innerText()).replace(/\D/g, ""));
	/** Waits until the list says `count` assets match. */
	const settledAt = (count: number) =>
		page().waitForFunction(
			(want) =>
				document.querySelector("[data-asset-count]")?.textContent?.replace(/\D/g, "") ===
				String(want),
			count,
		);
	/** Types a search and waits until the list shows its `count` results. */
	const searchFor = async (text: string, count: number) => {
		await list().getByRole("searchbox", { name: "Search assets" }).fill(text);
		await page().waitForURL((url) => (url.searchParams.get("q") ?? "") === text.trim());
		await settledAt(count);
	};
	return { list, panel, checklistCard, listed, listCount, settledAt, searchFor };
}
