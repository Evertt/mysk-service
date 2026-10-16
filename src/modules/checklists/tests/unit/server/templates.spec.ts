import { rmSync } from "node:fs";

import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { activity } from "#lib/server/db/schema.ts";
import {
	addPoint,
	deletePoint,
	moveGroup,
	movePoint,
	updatePoint,
} from "#modules/checklists/server/points.ts";
import {
	checklistTemplate,
	checklistTemplateCategory,
	checklistTemplateItem,
} from "#modules/checklists/server/schema.ts";
import {
	createTemplate,
	offeredTemplate,
	restoreTemplate,
	retireTemplate,
	setTemplateCategories,
	templateDetail,
	templateList,
	unitTemplate,
	updateTemplate,
} from "#modules/checklists/server/templates.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database made by the app's migrations. Not an in-memory one: libsql gives a
// transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "checklist-templates-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const { drizzleQueued } = await import("#lib/server/db/serialize.ts");
	const schema = await import("#lib/server/db/schema.ts");
	const moduleSchema = await import("#lib/server/db/modules.gen.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into user (id, name, email, created_at, updated_at) values
			('u1', 'Jo', 'jo@example.test', 0, 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Utrecht', 'Utrecht', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Sectionaaldeuren', null, 0), (2, 'north', 'Snelroldeuren', null, 1),
			(3, 'north', 'Trappen', null, 2), (9, 'south', 'Ketel', null, 0);
		insert into equipment (id, organization_id, serial_number, model, manufacturer, category_id,
			status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'SN-10', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(11, 'north', 'SN-11', 'M', 'Make', 3, 'operational', 1, 1, '2020-01-01', '2030-01-01');
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenantOf = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["owner"],
	modules: ["checklists"],
});

/** Refuses on a form field, as a remote form's `issue.name` does. */
const issue = (message: string) => ({ message, path: ["field"] });

/** What `invalid()` refused with, or the error's status. */
async function refusal(work: Promise<unknown>) {
	try {
		await work;
	} catch (error) {
		const { issues, status } = error as { issues?: { message: string }[]; status?: number };
		return issues ? issues.map((i) => i.message) : status;
	}
	throw new Error("Not refused");
}

const pointsOf = (templateId: number) =>
	db
		.select({
			id: checklistTemplateItem.id,
			group: checklistTemplateItem.group,
			text: checklistTemplateItem.text,
			position: checklistTemplateItem.position,
		})
		.from(checklistTemplateItem)
		.where(eq(checklistTemplateItem.templateId, templateId))
		.orderBy(asc(checklistTemplateItem.position));

/** A template's points as `group:text`, in their order. */
const readPoints = async (templateId: number) =>
	(await templateDetail(templateId)).points.map((p) => `${p.group}:${p.text}`);

const logged = () =>
	db
		.select({
			action: activity.action,
			subjectType: activity.subjectType,
			subjectLabel: activity.subjectLabel,
			parentType: activity.parentType,
			parentLabel: activity.parentLabel,
			changes: activity.changes,
		})
		.from(activity)
		.orderBy(asc(activity.id));

const sectional = { name: "Sectionaaldeur", norm: "NEN-EN 12604/12453", validityMonths: 12 };

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenantOf("north");
	await db.delete(checklistTemplateCategory);
	await db.delete(checklistTemplateItem);
	await db.delete(checklistTemplate);
	await db.run(sql`delete from activity`);
});

describe("templates", () => {
	test("a new one goes last, without points, and is logged", async () => {
		const first = await createTemplate(sectional, issue);
		const second = await createTemplate({ ...sectional, name: "Trap", norm: null }, issue);
		const { templates } = await templateList();
		expect(templates.map((t) => [t.id, t.name, t.pointCount])).toEqual([
			[first, "Sectionaaldeur", 0],
			[second, "Trap", 0],
		]);
		expect(await logged()).toMatchObject([
			{ action: "created", subjectType: "checklistTemplate", subjectLabel: "Sectionaaldeur" },
			{ action: "created", subjectLabel: "Trap" },
		]);
	});

	test("names are unique within the tenant, whatever their case, but not across tenants", async () => {
		const id = await createTemplate(sectional, issue);
		expect(await refusal(createTemplate({ ...sectional, name: "sectionaaldeur" }, issue))).toEqual([
			"There's a template Sectionaaldeur already",
		]);
		const other = await createTemplate({ ...sectional, name: "Trap" }, issue);
		expect(
			await refusal(updateTemplate(other, { ...sectional, name: "SECTIONAALDEUR" }, issue)),
		).toEqual(["There's a template Sectionaaldeur already"]);
		// Its own name, in another case, is fine.
		await updateTemplate(id, { ...sectional, name: "SectionaalDeur" }, issue);
		locals.tenant = tenantOf("south");
		await createTemplate(sectional, issue);
	});

	test("an update logs what changed, and nothing when nothing did", async () => {
		const id = await createTemplate(sectional, issue);
		await updateTemplate(id, { ...sectional, validityMonths: 24 }, issue);
		await updateTemplate(id, { ...sectional, validityMonths: 24 }, issue);
		const entries = await logged();
		expect(entries).toHaveLength(2);
		expect(entries[1]).toMatchObject({
			action: "updated",
			changes: { validityMonths: [12, 24] },
		});
	});

	test("another tenant's template is a 404, to read or change", async () => {
		const id = await createTemplate(sectional, issue);
		locals.tenant = tenantOf("south");
		expect(await refusal(templateDetail(id))).toBe(404);
		expect(await refusal(updateTemplate(id, { ...sectional, name: "Taken" }, issue))).toBe(404);
		expect(await refusal(setTemplateCategories(id, [], issue))).toBe(404);
		expect(await refusal(retireTemplate(id))).toBe(404);
		expect(await refusal(addPoint({ templateId: id, group: "", text: "Mine" }))).toBe(404);
		expect((await templateList()).templates).toEqual([]);
		locals.tenant = tenantOf("north");
		expect((await templateDetail(id)).template.name).toBe("Sectionaaldeur");
	});
});

describe("categories", () => {
	test("a template is for the categories it's given, and the list shows the others as gaps", async () => {
		const id = await createTemplate(sectional, issue);
		await setTemplateCategories(id, [2, 1, 1], issue);
		const { templates, uncovered } = await templateList();
		expect(templates[0].categories).toEqual([
			{ id: 1, name: "Sectionaaldeuren" },
			{ id: 2, name: "Snelroldeuren" },
		]);
		expect(uncovered).toEqual([{ id: 3, name: "Trappen" }]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "updated",
			changes: { categoryIds: [[], [1, 2]] },
		});
		await setTemplateCategories(id, [1], issue);
		expect((await logged()).at(-1)).toMatchObject({ changes: { categoryIds: [[1, 2], [1]] } });
	});

	test("a category has one template: another's is refused, naming both", async () => {
		const first = await createTemplate(sectional, issue);
		const second = await createTemplate({ ...sectional, name: "Snelroldeur" }, issue);
		await setTemplateCategories(first, [1, 2], issue);
		expect(await refusal(setTemplateCategories(second, [2, 3], issue))).toEqual([
			"Snelroldeuren has the template Sectionaaldeur already. Take it off there first.",
		]);
		// Nothing changed, and the database holds it too.
		expect(
			(await templateDetail(second)).categories.filter((c) => c.templateId === second),
		).toEqual([]);
		await expect(
			db
				.insert(checklistTemplateCategory)
				.values({ organizationId: "north", templateId: second, categoryId: 2 }),
		).rejects.toThrow();
		// Once the first gives it up, the second may have it.
		await setTemplateCategories(first, [1], issue);
		await setTemplateCategories(second, [2, 3], issue);
		expect((await templateList()).uncovered).toEqual([]);
	});

	test("another tenant's category is a 404", async () => {
		const id = await createTemplate(sectional, issue);
		expect(await refusal(setTemplateCategories(id, [9], issue))).toBe(404);
		expect(await db.select().from(checklistTemplateCategory)).toEqual([]);
	});

	test("a unit is offered its category's template, if it has one", async () => {
		const id = await createTemplate(sectional, issue);
		expect(await unitTemplate("SN-10")).toEqual({ category: "Sectionaaldeuren", template: null });
		await setTemplateCategories(id, [1], issue);
		expect(await unitTemplate("SN-10")).toEqual({
			category: "Sectionaaldeuren",
			template: { id, name: "Sectionaaldeur", norm: "NEN-EN 12604/12453", validityMonths: 12 },
		});
		expect(await unitTemplate("SN-11")).toEqual({ category: "Trappen", template: null });
		expect(await refusal(unitTemplate("SN-404"))).toBe(404);
		locals.tenant = tenantOf("south");
		expect(await refusal(unitTemplate("SN-10"))).toBe(404);
		expect(await offeredTemplate(db, 1)).toBeNull();
	});
});

describe("retiring", () => {
	test("a retired template is kept with its points, offered no longer, and frees its categories", async () => {
		const id = await createTemplate(sectional, issue);
		await addPoint({ templateId: id, group: "Mechanisch", text: "Veren" });
		await setTemplateCategories(id, [1, 2], issue);
		await retireTemplate(id);

		const { templates, uncovered } = await templateList();
		expect(templates).toMatchObject([{ id, archived: true, pointCount: 1, categories: [] }]);
		expect(uncovered.map((c) => c.id)).toEqual([1, 2, 3]);
		expect(await offeredTemplate(db, 1)).toBeNull();
		expect((await unitTemplate("SN-10")).template).toBeNull();
		expect((await logged()).at(-1)).toMatchObject({
			action: "retired",
			changes: { categoryIds: [[1, 2], []] },
		});
		// Retiring it again changes and logs nothing.
		await retireTemplate(id);
		expect((await logged()).filter((entry) => entry.action === "retired")).toHaveLength(1);
	});

	test("a retired template isn't changed until it's restored, without its categories", async () => {
		const id = await createTemplate(sectional, issue);
		await addPoint({ templateId: id, group: "", text: "Veren" });
		const [{ id: pointId }] = await pointsOf(id);
		await retireTemplate(id);
		const refused = ["Sectionaaldeur is retired. Restore it to change it."];
		expect(await refusal(updateTemplate(id, { ...sectional, validityMonths: 6 }, issue))).toEqual(
			refused,
		);
		expect(await refusal(setTemplateCategories(id, [1], issue))).toEqual(refused);
		expect(await refusal(addPoint({ templateId: id, group: "", text: "Kabels" }))).toEqual(refused);
		expect(await refusal(updatePoint(pointId, { group: "", text: "Kabels" }))).toEqual(refused);
		expect(await refusal(movePoint(pointId, "down"))).toEqual(refused);
		expect(await refusal(deletePoint(pointId))).toEqual(refused);

		await restoreTemplate(id);
		const { template, categories } = await templateDetail(id);
		expect(template.archived).toBe(false);
		expect(categories.every((category) => category.templateId === null)).toBe(true);
		expect((await logged()).at(-1)).toMatchObject({ action: "restored" });
		await setTemplateCategories(id, [1], issue);
		expect((await unitTemplate("SN-10")).template?.id).toBe(id);
	});
});

describe("points", () => {
	/** A template with points in groups M, E and V. */
	async function withPoints() {
		const id = await createTemplate(sectional, issue);
		for (const [group, text] of [
			["M", "m1"],
			["M", "m2"],
			["E", "e1"],
			["V", "v1"],
		]) {
			await addPoint({ templateId: id, group, text });
		}
		const ids = Object.fromEntries((await pointsOf(id)).map((p) => [p.text, p.id]));
		return { id, ids };
	}

	test("a new point goes last in its group, or starts a group at the end", async () => {
		const { id } = await withPoints();
		await addPoint({ templateId: id, group: "M", text: "m3" });
		await addPoint({ templateId: id, group: "Afronding", text: "a1" });
		expect(await readPoints(id)).toEqual(["M:m1", "M:m2", "M:m3", "E:e1", "V:v1", "Afronding:a1"]);
		// Stored in that order, numbered from 0.
		expect((await pointsOf(id)).map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "created",
			subjectType: "checklistTemplateItem",
			subjectLabel: "a1",
			parentType: "checklistTemplate",
			parentLabel: "Sectionaaldeur",
		});
	});

	test("moving a point swaps it within its group, or takes it into the next", async () => {
		const { id, ids } = await withPoints();
		await movePoint(ids.m2, "up");
		expect(await readPoints(id)).toEqual(["M:m2", "M:m1", "E:e1", "V:v1"]);
		await movePoint(ids.m1, "down");
		expect(await readPoints(id)).toEqual(["M:m2", "E:m1", "E:e1", "V:v1"]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "updated",
			subjectLabel: "m1",
			parentLabel: "Sectionaaldeur",
			changes: { group: ["M", "E"] },
		});
		// The first can't move up: nothing changes, nothing's logged.
		const before = (await logged()).length;
		await movePoint(ids.m2, "up");
		expect(await readPoints(id)).toEqual(["M:m2", "E:m1", "E:e1", "V:v1"]);
		expect(await logged()).toHaveLength(before);
	});

	test("moving a group takes its points past the group next to it, logged on the template", async () => {
		const { id } = await withPoints();
		await moveGroup(id, "V", "up");
		expect(await readPoints(id)).toEqual(["M:m1", "M:m2", "V:v1", "E:e1"]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "updated",
			subjectType: "checklistTemplate",
			changes: {
				groups: [
					["M", "E", "V"],
					["M", "V", "E"],
				],
			},
		});
	});

	test("editing a point's group puts it last in the other; its text changes in place", async () => {
		const { id, ids } = await withPoints();
		await updatePoint(ids.m1, { group: "V", text: "m1" });
		expect(await readPoints(id)).toEqual(["M:m2", "E:e1", "V:v1", "V:m1"]);
		await updatePoint(ids.e1, { group: "E", text: "Aandrijving werkend" });
		expect(await readPoints(id)).toEqual(["M:m2", "E:Aandrijving werkend", "V:v1", "V:m1"]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "updated",
			subjectLabel: "Aandrijving werkend",
			changes: { text: ["e1", "Aandrijving werkend"] },
		});
	});

	test("a deleted point is gone and logged against its template", async () => {
		const { id, ids } = await withPoints();
		await deletePoint(ids.e1);
		expect(await readPoints(id)).toEqual(["M:m1", "M:m2", "V:v1"]);
		expect((await logged()).at(-1)).toMatchObject({
			action: "deleted",
			subjectLabel: "e1",
			parentType: "checklistTemplate",
		});
		expect((await templateList()).templates[0].pointCount).toBe(3);
	});

	test("another tenant's point is a 404, and stays as it was", async () => {
		const { id, ids } = await withPoints();
		locals.tenant = tenantOf("south");
		expect(await refusal(updatePoint(ids.m1, { group: "M", text: "Taken" }))).toBe(404);
		expect(await refusal(movePoint(ids.m1, "down"))).toBe(404);
		expect(await refusal(moveGroup(id, "M", "down"))).toBe(404);
		expect(await refusal(deletePoint(ids.m1))).toBe(404);
		locals.tenant = tenantOf("north");
		expect(await readPoints(id)).toEqual(["M:m1", "M:m2", "E:e1", "V:v1"]);
		expect(
			await db.get<{ n: number }>(
				sql`select count(*) as n from activity where organization_id = 'south'`,
			),
		).toEqual({ n: 0 });
	});
});
