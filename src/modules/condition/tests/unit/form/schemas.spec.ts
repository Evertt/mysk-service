import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { componentSchema } from "#modules/condition/form/component-schema.ts";
import { conditionSchema } from "#modules/condition/form/condition-schema.ts";
import { settingsSchema } from "#modules/condition/form/settings-schema.ts";

test("a condition is its defects, each graded on NEN 2767's scales, with optional advice; no score is sent", () => {
	const parse = (input: object) => v.safeParse(conditionSchema, { serialNumber: "SN-1", ...input });
	const defect = {
		componentId: "",
		description: " Veerbreuk ",
		severity: "severe",
		extent: "4",
		intensity: "advanced",
	};
	expect(parse({}).output).toEqual({
		serialNumber: "SN-1",
		componentId: null,
		defects: [],
		advice: "",
	});
	expect(parse({ defects: [defect], advice: "  Rollen vervangen. " }).output).toEqual({
		serialNumber: "SN-1",
		componentId: null,
		defects: [
			{
				componentId: null,
				description: "Veerbreuk",
				severity: "severe",
				extent: 4,
				intensity: "advanced",
				photos: [],
			},
		],
		advice: "Rollen vervangen.",
	});
	// A component's, by its id; a defect on one.
	expect(parse({ componentId: "7" }).output).toMatchObject({ componentId: 7 });
	expect(parse({ defects: [{ ...defect, componentId: "3" }] }).output).toMatchObject({
		defects: [{ componentId: 3 }],
	});
	expect(parse({ componentId: "x" }).success).toBe(false);
	for (const wrong of [
		{ description: "  " },
		{ description: "x".repeat(301) },
		{ severity: "" },
		{ severity: "fatal" },
		{ extent: "0" },
		{ extent: "6" },
		{ extent: "2.5" },
		{ intensity: "end" },
		{ componentId: "0" },
	]) {
		expect(parse({ defects: [{ ...defect, ...wrong }] }).success, JSON.stringify(wrong)).toBe(
			false,
		);
	}
	expect(parse({ defects: Array.from({ length: 31 }, () => defect) }).success).toBe(false);
	expect(parse({ advice: "x".repeat(501) }).success).toBe(false);
	// A score sent along is no field of it.
	expect(parse({ score: 1, defects: [{ ...defect, score: "1" }] }).output).not.toHaveProperty(
		"score",
	);
});

test("the settings are scores from 2 to 6, attention below critical", () => {
	const parse = (input: object) => v.safeParse(settingsSchema, input);
	expect(parse({ criticalFrom: 5, attentionFrom: 4 }).output).toEqual({
		criticalFrom: 5,
		attentionFrom: 4,
		autoPlan: false,
	});
	expect(parse({ criticalFrom: 6, attentionFrom: 2, autoPlan: true }).success).toBe(true);
	const refused = parse({ criticalFrom: 4, attentionFrom: 4 });
	expect(refused.success).toBe(false);
	expect(refused.issues?.[0].path?.[0].key).toBe("attentionFrom");
	expect(parse({ criticalFrom: 4, attentionFrom: 5 }).success).toBe(false);
	expect(parse({ criticalFrom: 5, attentionFrom: 1 }).success).toBe(false);
	expect(parse({ criticalFrom: 7, attentionFrom: 4 }).success).toBe(false);
	expect(parse({ criticalFrom: 4.5, attentionFrom: 2 }).success).toBe(false);
});

test("a component has a name, an article if any, and the points that check it", () => {
	const parse = (input: object) =>
		v.safeParse(componentSchema, {
			serialNumber: "SN-1",
			id: "",
			name: "Torsieveerpakket",
			...input,
		});
	expect(parse({}).output).toEqual({
		serialNumber: "SN-1",
		id: null,
		name: "Torsieveerpakket",
		materialId: null,
		checkpointIds: [],
	});
	expect(parse({ id: "3", materialId: "12", checkpointIds: ["28", "31"] }).output).toMatchObject({
		id: 3,
		materialId: 12,
		checkpointIds: [28, 31],
	});
	expect(parse({ name: "  " }).success).toBe(false);
	expect(parse({ name: "x".repeat(81) }).success).toBe(false);
	expect(parse({ checkpointIds: ["0"] }).success).toBe(false);
});
