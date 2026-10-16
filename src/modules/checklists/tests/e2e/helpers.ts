/** What the checklists module's end-to-end tests share: templates and points as stored, and the pages' parts. */
import type { Locator } from "playwright";

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
