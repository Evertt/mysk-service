/**
 * The tenant's checklist templates: every office member reads them (the template pages, the card
 * on a unit's page); managers change them. A template's page watches it (`refreshOnRecordChange()`).
 */
import { redirect } from "@sveltejs/kit";
import * as v from "valibot";

import { id, moveSchema } from "#lib/schema.ts";

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

/**
 * The tenant's templates in their order (the retired ones too) with their categories and number of
 * points, and the categories without a template.
 */
export const getTemplates = query(() => templateList());

/** The tenant's template `id` with its points and the tenant's categories, or a 404. */
export const getTemplate = query(id(), (templateId) => templateDetail(templateId));

/** The tenant's unit (by serial number) with its category and the template it's inspected by. */
export const getUnitTemplate = query(v.string(), (serialNumber) => unitTemplate(serialNumber));

export const addTemplate = forManagers.form(newTemplateSchema, async (input) => {
	const templateId = await createTemplate(input);
	// Sent along with the redirect, so the list it goes back to doesn't show what it cached.
	void getTemplates().refresh();
	redirect(303, `/checklists/settings/${templateId}`);
});

export const saveTemplate = forManagers.form(templateSchema, ({ id, ...input }) =>
	updateTemplate(id, input),
);

export const saveTemplateCategories = forManagers.form(
	templateCategoriesSchema,
	({ id, categoryIds }) => setTemplateCategories(id, categoryIds),
);

export const retire = forManagers.form(templateIdSchema, ({ id }) => retireTemplate(id));

export const restore = forManagers.form(templateIdSchema, ({ id }) => restoreTemplate(id));

export const createPoint = forManagers.form(newPointSchema, (input) => addPoint(input));

export const savePoint = forManagers.form(pointSchema, ({ id, ...input }) =>
	updatePoint(id, input),
);

export const shiftPoint = forManagers.form(moveSchema, ({ id, direction }) =>
	movePoint(id, direction),
);

export const shiftGroup = forManagers.form(moveGroupSchema, ({ templateId, group, direction }) =>
	moveGroup(templateId, group, direction),
);

export const removePoint = forManagers.form(pointIdSchema, ({ id }) => deletePoint(id));
