import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { componentSchema } from "#modules/condition/form/component-schema.ts";
import { conditionSchema } from "#modules/condition/form/condition-schema.ts";
import { settingsSchema } from "#modules/condition/form/settings-schema.ts";

test("a condition is a whole score from 0 to 100, with optional advice", () => {
	const parse = (input: object) => v.safeParse(conditionSchema, { serialNumber: "SN-1", ...input });
	expect(parse({ score: 0 }).success).toBe(true);
	expect(parse({ score: 100, advice: "  Rollen vervangen. " }).output).toEqual({
		serialNumber: "SN-1",
		componentId: null,
		score: 100,
		advice: "Rollen vervangen.",
	});
	// A component's, by its id.
	expect(parse({ componentId: "7", score: 22 }).output).toMatchObject({ componentId: 7 });
	expect(parse({ componentId: "x", score: 22 }).success).toBe(false);
	expect(parse({ score: 22 }).output).toMatchObject({ advice: "" });
	expect(parse({ score: -1 }).success).toBe(false);
	expect(parse({ score: 101 }).success).toBe(false);
	expect(parse({ score: 50.5 }).success).toBe(false);
	expect(parse({ score: 50, advice: "x".repeat(501) }).success).toBe(false);
});

test("the settings keep critical below attention", () => {
	const parse = (input: object) => v.safeParse(settingsSchema, input);
	expect(parse({ criticalBelow: 40, attentionBelow: 70 }).output).toEqual({
		criticalBelow: 40,
		attentionBelow: 70,
		autoPlan: false,
	});
	expect(parse({ criticalBelow: 40, attentionBelow: 70, autoPlan: true }).success).toBe(true);
	const refused = parse({ criticalBelow: 70, attentionBelow: 60 });
	expect(refused.success).toBe(false);
	expect(refused.issues?.[0].path?.[0].key).toBe("criticalBelow");
	expect(parse({ criticalBelow: 0, attentionBelow: 60 }).success).toBe(false);
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
