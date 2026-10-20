/**
 * The tenant's checklist templates: every office member reads them (the template pages, the card
 * on a unit's page); managers change them. Each change refreshes the list and the template's page.
 */
import { redirect } from "@sveltejs/kit";
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { id, moveSchema } from "#lib/schema.ts";
import { currentTenant } from "#lib/server/auth/index.ts";

import {
	moveGroupSchema,
	newPointSchema,
	newTemplateSchema,
	pointIdSchema,
	pointSchema,
	templateCategoriesSchema,
	templateIdSchema,
	templateSchema,
} from "./form/template-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { addPoint, deletePoint, moveGroup, movePoint, updatePoint } from "./server/points.ts";
import {
	createTemplate,
	restoreTemplate,
	retireTemplate,
	setTemplateCategories,
	templateDetail,
	templateList,
	unitTemplate,
	updateTemplate,
} from "./server/templates.ts";

const canManage = () => isManager(currentTenant().roles);

/**
 * The tenant's templates in their order (the retired ones too) with their categories and number of
 * points, the categories without a template, and whether the user may change them.
 */
export const getTemplates = query(async () => ({
	...(await templateList()),
	canManage: canManage(),
}));

/** The tenant's template `id` with its points and the tenant's categories, or a 404. */
export const getTemplate = query(id(), async (templateId) => ({
	...(await templateDetail(templateId)),
	canManage: canManage(),
}));

/** The tenant's unit (by serial number) with its category and the template it's inspected by. */
export const getUnitTemplate = query(v.string(), (serialNumber) => unitTemplate(serialNumber));

const refresh = (templateId: number) => {
	void getTemplates().refresh();
	void getTemplate(String(templateId)).refresh();
};

export const addTemplate = forManagers.form(newTemplateSchema, async (input) => {
	const templateId = await createTemplate(input);
	void getTemplates().refresh();
	redirect(303, `/checklists/settings/${templateId}`);
});

export const saveTemplate = forManagers.form(templateSchema, async ({ id, ...input }) => {
	await updateTemplate(id, input);
	refresh(id);
});

export const saveTemplateCategories = forManagers.form(
	templateCategoriesSchema,
	async ({ id, categoryIds }) => {
		await setTemplateCategories(id, categoryIds);
		refresh(id);
	},
);

export const retire = forManagers.form(templateIdSchema, async ({ id }) => {
	await retireTemplate(id);
	refresh(id);
});

export const restore = forManagers.form(templateIdSchema, async ({ id }) => {
	await restoreTemplate(id);
	refresh(id);
});

export const createPoint = forManagers.form(newPointSchema, async (input) => {
	refresh(await addPoint(input));
});

export const savePoint = forManagers.form(pointSchema, async ({ id, ...input }) => {
	refresh(await updatePoint(id, input));
});

export const shiftPoint = forManagers.form(moveSchema, async ({ id, direction }) => {
	refresh(await movePoint(id, direction));
});

export const shiftGroup = forManagers.form(
	moveGroupSchema,
	async ({ templateId, group, direction }) => {
		refresh(await moveGroup(templateId, group, direction));
	},
);

export const removePoint = forManagers.form(pointIdSchema, async ({ id }) => {
	refresh(await deletePoint(id));
});
