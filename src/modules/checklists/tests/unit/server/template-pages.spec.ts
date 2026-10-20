/**
 * The checklist templates' remote functions on the seeded demo database, as their pages call them:
 * North's list with its categories and the categories none is for, a unit offered its category's
 * template, adding one (a name North hasn't, in any case), its categories (one another template is
 * for refused), its points, retiring and restoring it, what's logged; a member reading them but
 * refused the managers' forms; and North never reading or changing SHLTR's templates, points or
 * categories by their ids. The server side of `checklists.test.ts` and `checklists.tenancy.test.ts`,
 * which keep the pages and one tampered form. What the server functions do with each change in
 * detail (placing, moving, logging) is `templates.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	addTemplate,
	createPoint,
	getTemplate,
	getTemplates,
	getUnitTemplate,
	removePoint,
	restore,
	retire,
	saveTemplate,
	saveTemplateCategories,
	savePoint,
	shiftGroup,
	shiftPoint,
} from "#modules/checklists/templates.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

interface Template {
	id: number;
	name: string;
	norm: string | null;
	validity_months: number;
	position: number;
	archived: number;
}

/** An organization's templates as stored, in their order. */
const templatesOf = (organization: string) =>
	rows<Template>(
		`select id, name, norm, validity_months, position, archived from checklist_template
		 where organization_id = ? order by position, id`,
		[organization],
	);

const templateNamed = async (organization: string, name: string) =>
	(await templatesOf(organization)).find((template) => template.name === name)!;

/** A template's points as stored, in their order, as `group:text`. */
const pointsOf = async (templateId: number) =>
	(
		await rows<{ group_name: string; text: string }>(
			`select group_name, text from checklist_template_item where template_id = ?
			 order by position, id`,
			[templateId],
		)
	).map((point) => `${point.group_name}:${point.text}`);

/** The names of the categories a template is for, by name. */
const categoriesOf = async (templateId: number) =>
	(
		await rows<{ name: string }>(
			`select c.name from checklist_template_category tc
			 join equipment_category c on c.id = tc.category_id where tc.template_id = ? order by c.name`,
			[templateId],
		)
	).map((row) => row.name);

/** North's category `name`'s id, as its checkbox sends it. */
const categoryId = async (name: string, organization = northId) =>
	String(
		await value(`select id from equipment_category where organization_id = ? and name = ?`, [
			organization,
			name,
		]),
	);

/** A unit of North's category `name`, by serial number. */
const unitOf = async (name: string) =>
	String(
		await value(
			`select e.serial_number from equipment e join equipment_category c on c.id = e.category_id
			 where e.organization_id = ? and c.name = ? order by e.id limit 1`,
			[northId, name],
		),
	);

/** What was logged about a template and its points, after the entry `since`, oldest first. */
const loggedOf = (templateId: number, since = 0) =>
	rows<{ action: string; subject_type: string; subject_label: string }>(
		`select action, subject_type, subject_label from activity where id > ?
		 and ((subject_type = 'checklistTemplate' and subject_id = ?)
			or (parent_type = 'checklistTemplate' and parent_id = ?))
		 order by id`,
		[since, String(templateId), String(templateId)],
	);

const lastActivity = async () => Number(await value(`select coalesce(max(id), 0) from activity`));

describe("North's templates, to its owner", () => {
	test("are listed in their order, with their categories and points, and the categories none is for", async () => {
		const { templates, uncovered } = await as(north.owner, () => data(getTemplates));
		expect(templates.map((template) => template.name)).toEqual([
			"Stookinstallatie",
			"Koelmachine",
			"Luchtbehandelingskast",
			"Noodstroomaggregaat",
			"Lift",
		]);
		expect(templates.find((template) => template.name === "Koelmachine")).toMatchObject({
			norm: "F-gassen",
			validityMonths: 12,
			archived: false,
			pointCount: 5,
			categories: [{ name: "Koelmachine" }],
		});
		expect(uncovered.map((category) => category.name).toSorted()).toEqual(["Compressor", "Pomp"]);
	});

	test("a unit is offered its category's template", async () => {
		const serial = await unitOf("Koelmachine");
		expect(await as(north.member, () => data(getUnitTemplate, serial))).toEqual({
			category: "Koelmachine",
			template: expect.objectContaining({
				name: "Koelmachine",
				norm: "F-gassen",
				validityMonths: 12,
			}),
		});
		expect(await as(north.member, () => call(getUnitTemplate, "NO-SUCH-SERIAL"))).toMatchObject({
			status: 404,
		});
	});

	let added: Template;

	test("a new one needs a name North hasn't, in any case, and lands on its page, logged", async () => {
		const since = await lastActivity();
		const taken = await as(north.owner, () =>
			submit(addTemplate, { name: " koelmachine ", validityMonths: 24 }),
		);
		expect(taken).toMatchObject({
			status: 400,
			issues: [{ name: "name", message: "There's a template Koelmachine already" }],
		});

		const answer = await as(north.owner, () =>
			submit(addTemplate, { name: "Compressor", norm: "NEN-EN 1012", validityMonths: 24 }),
		);
		added = await templateNamed(northId, "Compressor");
		expect(answer).toMatchObject({
			status: 303,
			location: `/checklists/settings/${added.id}`,
			refreshed: ["getTemplates"],
		});
		expect(added).toMatchObject({ norm: "NEN-EN 1012", validity_months: 24, archived: 0 });
		expect(added.position).toBe(Math.max(...(await templatesOf(northId)).map((t) => t.position)));
		expect(await loggedOf(added.id, since)).toEqual([
			{ action: "created", subject_type: "checklistTemplate", subject_label: "Compressor" },
		]);
		const page = await as(north.owner, () => data(getTemplate, String(added.id)));
		expect(page).toMatchObject({ template: { name: "Compressor" }, points: [] });
	});

	test("its categories: one another template is for is refused, naming it", async () => {
		const [koelmachine, compressor, pomp] = await Promise.all(
			["Koelmachine", "Compressor", "Pomp"].map((name) => categoryId(name)),
		);
		const refused = await as(north.owner, () =>
			submit(saveTemplateCategories, { id: String(added.id), categoryIds: [koelmachine] }),
		);
		expect(refused.status).toBe(400);
		expect(refused.issues?.[0].message).toContain("Koelmachine");
		expect(await categoriesOf(added.id)).toEqual([]);

		const saved = await as(north.owner, () =>
			submit(saveTemplateCategories, { id: String(added.id), categoryIds: [compressor, pomp] }),
		);
		expect(saved).toMatchObject({ status: 200, refreshed: ["getTemplates", "getTemplate"] });
		expect(await categoriesOf(added.id)).toEqual(["Compressor", "Pomp"]);
		const { uncovered } = await as(north.owner, () => data(getTemplates));
		expect(uncovered).toEqual([]);
	});

	test("its points are added last in their group, moved and deleted", async () => {
		const templateId = String(added.id);
		await as(north.owner, async () => {
			for (const [group, text] of [
				["Smering", "Olie ververst"],
				["Veiligheid", "Drukschakelaar getest"],
				["Smering", "Filters vervangen"],
			]) {
				expect(await submit(createPoint, { templateId, group, text })).toMatchObject({
					status: 200,
					refreshed: ["getTemplates", "getTemplate"],
				});
			}
		});
		expect(await pointsOf(added.id)).toEqual([
			"Smering:Olie ververst",
			"Smering:Filters vervangen",
			"Veiligheid:Drukschakelaar getest",
		]);

		const { points } = await as(north.owner, () => data(getTemplate, templateId));
		const filters = points.find((point) => point.text === "Filters vervangen")!;
		await as(north.owner, () => submit(shiftPoint, { id: String(filters.id), direction: "up" }));
		expect(await pointsOf(added.id)).toEqual([
			"Smering:Filters vervangen",
			"Smering:Olie ververst",
			"Veiligheid:Drukschakelaar getest",
		]);

		await as(north.owner, () => submit(removePoint, { id: String(filters.id) }));
		expect(await pointsOf(added.id)).toEqual([
			"Smering:Olie ververst",
			"Veiligheid:Drukschakelaar getest",
		]);
		expect((await loggedOf(added.id)).map((entry) => entry.action)).toEqual([
			"created",
			"updated",
			"created",
			"created",
			"created",
			"updated",
			"deleted",
		]);
	});

	test("retired, it keeps its points and frees its categories, its units offered none, until it's restored", async () => {
		const id = String(added.id);
		const compressor = await unitOf("Compressor");
		expect((await as(north.member, () => data(getUnitTemplate, compressor))).template?.name).toBe(
			"Compressor",
		);

		expect(await as(north.owner, () => submit(retire, { id }))).toMatchObject({ status: 200 });
		expect((await templateNamed(northId, "Compressor")).archived).toBe(1);
		expect(await categoriesOf(added.id)).toEqual([]);
		expect(await pointsOf(added.id)).toHaveLength(2);
		expect((await as(north.member, () => data(getUnitTemplate, compressor))).template).toBeNull();
		const { uncovered } = await as(north.owner, () => data(getTemplates));
		expect(uncovered.map((category) => category.name).toSorted()).toEqual(["Compressor", "Pomp"]);

		expect(await as(north.owner, () => submit(restore, { id }))).toMatchObject({ status: 200 });
		expect((await templateNamed(northId, "Compressor")).archived).toBe(0);
		expect((await loggedOf(added.id)).map((entry) => entry.action).slice(-2)).toEqual([
			"retired",
			"restored",
		]);
	});
});

describe("a member, in North", () => {
	test("reads the templates, but the managers' forms are a 403 and change nothing", async () => {
		const koelmachine = await templateNamed(northId, "Koelmachine");
		const id = String(koelmachine.id);
		const before = {
			templates: await templatesOf(northId),
			points: await pointsOf(koelmachine.id),
		};
		await as(north.member, async () => {
			const page = await data(getTemplate, id);
			expect(page.points.map((point) => point.text)).toContain("Lekdichtheidscontrole uitgevoerd");

			const [first] = page.points;
			for (const answer of [
				await submit(addTemplate, { name: "Planner's own", validityMonths: 12 }),
				await submit(saveTemplate, { id, name: "Planner's own", validityMonths: 12 }),
				await submit(shiftPoint, { id: String(first.id), direction: "down" }),
				await submit(removePoint, { id: String(first.id) }),
				await submit(retire, { id }),
			]) {
				expect(answer).toMatchObject({ status: 403 });
			}
		});
		expect(await templatesOf(northId)).toEqual(before.templates);
		expect(await pointsOf(koelmachine.id)).toEqual(before.points);
	});
});

describe("SHLTR's templates, to North", () => {
	test("are a 404 to read or change by their ids, its points and categories too, and nothing's changed or logged", async () => {
		const target = await templateNamed(shltrId, "Sectionaaldeur");
		const own = await templateNamed(northId, "Koelmachine");
		const [point] = await rows<{ id: number; group_name: string }>(
			`select id, group_name from checklist_template_item where template_id = ? order by position limit 1`,
			[target.id],
		);
		const shltrState = async () => ({
			templates: await templatesOf(shltrId),
			points: await rows(
				`select * from checklist_template_item where organization_id = ? order by id`,
				[shltrId],
			),
			categories: await rows(
				`select * from checklist_template_category where organization_id = ? order by category_id`,
				[shltrId],
			),
			logged: await value(
				`select count(*) from activity where organization_id = ? and subject_type like 'checklist%'`,
				[shltrId],
			),
		});
		const before = await shltrState();
		const id = String(target.id);
		const pointId = String(point.id);
		const shltrCategory = await categoryId("Sectionaaldeuren", shltrId);

		await as(north.owner, async () => {
			expect(await call(getTemplate, id)).toMatchObject({ status: 404 });
			const answers = {
				saveTemplate: await submit(saveTemplate, { id, name: "Overgenomen", validityMonths: 12 }),
				saveTemplateCategories: await submit(saveTemplateCategories, { id, categoryIds: [] }),
				"its category on North's": await submit(saveTemplateCategories, {
					id: String(own.id),
					categoryIds: [shltrCategory],
				}),
				retire: await submit(retire, { id }),
				restore: await submit(restore, { id }),
				createPoint: await submit(createPoint, { templateId: id, group: "", text: "Overgenomen" }),
				savePoint: await submit(savePoint, { id: pointId, group: "", text: "Overgenomen" }),
				shiftPoint: await submit(shiftPoint, { id: pointId, direction: "down" }),
				shiftGroup: await submit(shiftGroup, {
					templateId: id,
					group: point.group_name,
					direction: "down",
				}),
				removePoint: await submit(removePoint, { id: pointId }),
			};
			for (const [name, answer] of Object.entries(answers)) {
				expect(answer.status, `${name}: ${JSON.stringify(answer)}`).toBe(404);
			}
		});
		expect(await shltrState()).toEqual(before);
		expect((await templateNamed(northId, "Koelmachine")).name).toBe("Koelmachine");
		expect(await categoriesOf(own.id)).toEqual(["Koelmachine"]);
	});
});
