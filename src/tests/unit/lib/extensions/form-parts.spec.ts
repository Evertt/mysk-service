import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { formPartsSchema, partsOfModulesOff, preflightParts } from "#lib/extensions/form-parts.ts";

// Two made-up modules' parts of the order form: gadgets' count and gizmos' note.
vi.mock("#lib/extensions/form-parts.gen.ts", async () => {
	const v = await import("valibot");
	return {
		formParts: {
			"orders.form": {
				gadgets: v.object({ count: v.pipe(v.number(), v.minValue(1, "At least 1")) }),
				gizmos: v.object({ note: v.pipe(v.string(), v.nonEmpty("A note")) }),
			},
		},
	};
});

/** The messages and dot paths of a result's issues, or its value. */
const outcome = (result: v.SafeParseResult<v.GenericSchema>) =>
	result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => [v.getDotPath(issue), issue.message]) };

describe("formPartsSchema", () => {
	const schema = formPartsSchema("orders.form");

	test("validates each module's part with its schema, under its id", () => {
		expect(outcome(v.safeParse(schema, { gadgets: { count: 2 }, gizmos: { note: "Hi" } }))).toEqual(
			{ value: { gadgets: { count: 2 }, gizmos: { note: "Hi" } } },
		);
		expect(outcome(v.safeParse(schema, { gadgets: { count: 0 }, gizmos: { note: "" } }))).toEqual({
			issues: [
				["gadgets.count", "At least 1"],
				["gizmos.note", "A note"],
			],
		});
	});

	test("takes a part only from the modules that submit one, and none from unknown ones", () => {
		expect(outcome(v.safeParse(schema, { gadgets: { count: 1 }, other: { x: 1 } }))).toEqual({
			value: { gadgets: { count: 1 } },
		});
		expect(outcome(v.safeParse(schema, undefined))).toEqual({ value: undefined });
	});
});

describe("preflightParts", () => {
	const form = v.object({
		title: v.pipe(v.string(), v.nonEmpty("A title")),
		modules: formPartsSchema("orders.form"),
	});
	const preflight = preflightParts(form);
	const validate = (value: unknown) => preflight["~standard"].validate(value);

	test("reports only the issues of the modules' parts, with their paths", async () => {
		const result = await validate({ title: "", modules: { gadgets: { count: 0 } } });
		expect(result.issues?.map((issue) => issue.message)).toEqual(["At least 1"]);
		expect(v.getDotPath(result.issues![0] as v.BaseIssue<unknown>)).toBe("modules.gadgets.count");
	});

	test("leaves the form's own fields to the server", async () => {
		expect((await validate({ title: "", modules: { gadgets: { count: 1 } } })).issues).toBe(
			undefined,
		);
		expect((await validate({ title: "Fine" })).issues).toBe(undefined);
	});
});

test("partsOfModulesOff names the modules that submitted a part but aren't on", () => {
	const parts = { gadgets: { count: 1 }, gizmos: { note: "Hi" }, widgets: undefined };
	expect(partsOfModulesOff(parts, ["gadgets"])).toEqual(["gizmos"]);
	expect(partsOfModulesOff(parts, ["gadgets", "gizmos"])).toEqual([]);
	expect(partsOfModulesOff({}, [])).toEqual([]);
});
