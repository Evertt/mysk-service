import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { conditionSchema } from "#modules/condition/form/condition-schema.ts";
import { settingsSchema } from "#modules/condition/form/settings-schema.ts";

test("a condition is a whole score from 0 to 100, with optional advice", () => {
	const parse = (input: object) => v.safeParse(conditionSchema, { serialNumber: "SN-1", ...input });
	expect(parse({ score: 0 }).success).toBe(true);
	expect(parse({ score: 100, advice: "  Rollen vervangen. " }).output).toEqual({
		serialNumber: "SN-1",
		score: 100,
		advice: "Rollen vervangen.",
	});
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
