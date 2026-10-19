import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { dockSchema } from "#modules/docks/form/dock-schema.ts";

/** The parsed value, or the messages of all issues by field. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(dockSchema, input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => [v.getDotPath(issue), issue.message]) };
};

const form = { customer: "C-00042", siteId: "3", code: "DOCK 05" };

test("the optional texts are none when they're empty or left out", () => {
	expect(parse({ ...form, scpCode: " ", keyId: "K-12" })).toMatchObject({
		value: { position: "", scpCode: null, keyId: "K-12", keyStorageUnit: null },
	});
});

test("a text that's too long says how long it may be", () => {
	expect(parse({ ...form, position: "P".repeat(81), scpCode: "S".repeat(33) })).toEqual({
		issues: [
			["position", "Use at most 80 characters"],
			["scpCode", "Use at most 32 characters"],
		],
	});
});
