import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import {
	moveGroupSchema,
	newPointSchema,
	newTemplateSchema,
	templateCategoriesSchema,
} from "#modules/checklists/form/template-schema.ts";

const messages = (result: { issues?: { message: string }[] }) =>
	result.issues?.map((issue) => issue.message) ?? [];

describe("newTemplateSchema", () => {
	test("trims the name and norm, and takes an empty norm for none", () => {
		const result = v.safeParse(newTemplateSchema, {
			name: "  Sectionaaldeur ",
			norm: "   ",
			validityMonths: 12,
		});
		expect(result.output).toEqual({ name: "Sectionaaldeur", norm: null, validityMonths: 12 });
		expect(
			v.parse(newTemplateSchema, { name: "Trap", norm: " NEN-EN ISO 14122 ", validityMonths: 24 })
				.norm,
		).toBe("NEN-EN ISO 14122");
	});

	test("needs a name, and a whole number of months from 1 to 120", () => {
		expect(messages(v.safeParse(newTemplateSchema, { name: " ", validityMonths: 12 }))).toEqual([
			"Give the template a name",
		]);
		for (const validityMonths of [0, 121, 1.5, undefined]) {
			expect(messages(v.safeParse(newTemplateSchema, { name: "A", validityMonths }))).toEqual([
				"Between 1 and 120 months",
			]);
		}
	});

	test("refuses a name or norm that's too long", () => {
		const long = "x".repeat(81);
		expect(
			messages(v.safeParse(newTemplateSchema, { name: long, norm: long, validityMonths: 12 })),
		).toEqual(["Use at most 80 characters", "Use at most 80 characters"]);
	});
});

describe("newPointSchema", () => {
	test("needs a text; the group is optional and trimmed", () => {
		expect(v.parse(newPointSchema, { templateId: "3", text: " Filters " })).toEqual({
			templateId: 3,
			group: "",
			text: "Filters",
		});
		expect(
			v.parse(newPointSchema, { templateId: "3", group: " Mechanisch ", text: "x" }).group,
		).toBe("Mechanisch");
		expect(messages(v.safeParse(newPointSchema, { templateId: "3", text: "  " }))).toEqual([
			"Say what's checked",
		]);
	});
});

describe("templateCategoriesSchema", () => {
	test("takes no ticked boxes for no categories, and ids as numbers", () => {
		expect(v.parse(templateCategoriesSchema, { id: "1" })).toEqual({ id: 1, categoryIds: [] });
		expect(v.parse(templateCategoriesSchema, { id: "1", categoryIds: ["4", "7"] })).toEqual({
			id: 1,
			categoryIds: [4, 7],
		});
		expect(v.safeParse(templateCategoriesSchema, { id: "1", categoryIds: ["x"] }).success).toBe(
			false,
		);
	});
});

describe("moveGroupSchema", () => {
	test("takes the group without a name, and only up or down", () => {
		expect(v.parse(moveGroupSchema, { templateId: "2", direction: "up" })).toEqual({
			templateId: 2,
			group: "",
			direction: "up",
		});
		expect(
			v.safeParse(moveGroupSchema, { templateId: "2", group: "M", direction: "left" }).success,
		).toBe(false);
	});
});
