import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { MAX_ORDER_UNITS, orderFields, orderFormPreflight } from "#lib/orders/form/order-schema.ts";
import { day } from "#unit/temporal-support.ts";

// A made-up module's part of the order form: gadgets' count.
vi.mock("#lib/extensions/form-parts.gen.ts", async () => {
	const v = await import("valibot");
	const count = v.pipe(v.number(), v.minValue(1, "At least 1"));
	return { formParts: { "orders.form": { gadgets: v.object({ count }) } } };
});

/** The parsed value, or the messages of all issues. */
const parse = (input: Record<string, unknown>) => {
	const result = v.safeParse(v.object(orderFields), input);
	return result.success
		? { value: result.output }
		: { issues: result.issues.map((issue) => issue.message) };
};

const form = {
	customerId: "5",
	equipmentIds: ["11", "14"],
	engineerId: "2",
	type: "repair",
	status: "scheduled",
	priority: "high",
	description: "  Replace the pump seal ",
	scheduledFor: "2026-10-20",
	scheduledTime: "13:30",
	laborHours: 1.5,
};

test("a filled-in form becomes an order", () => {
	expect(parse(form)).toEqual({
		value: {
			...form,
			customerId: 5,
			equipmentIds: [11, 14],
			engineerId: 2,
			description: "Replace the pump seal",
			scheduledFor: day("2026-10-20"),
		},
	});
});

test("an order for a new installation, not yet assigned or scheduled", () => {
	const { equipmentIds: _units, ...rest } = form;
	// No units ticked: no field at all.
	const order = { ...rest, engineerId: "", scheduledFor: "", scheduledTime: "" };
	expect(parse(order)).toMatchObject({
		value: { equipmentIds: [], engineerId: null, scheduledFor: null, scheduledTime: null },
	});
});

test("its units are ids, at most as many as an order can have", () => {
	expect(new Set(parse({ ...form, equipmentIds: ["11", "x"] }).issues)).toEqual(
		new Set(["Choose units of the customer's"]),
	);
	const many = Array.from({ length: MAX_ORDER_UNITS + 1 }, (_, i) => String(i + 1));
	expect(parse({ ...form, equipmentIds: many })).toEqual({
		issues: [`An order can be about ${MAX_ORDER_UNITS} units at most`],
	});
	expect(parse({ ...form, equipmentIds: many.slice(1) })).toHaveProperty("value");
});

test("the time it's scheduled for must be a valid time", () => {
	expect(parse({ ...form, scheduledTime: "25:00" })).toEqual({ issues: ["Enter a valid time"] });
});

test("the customer and a description are required", () => {
	expect(parse({ ...form, customerId: "", description: "  " })).toEqual({
		issues: ["Choose a customer", "Describe the work"],
	});
});

test("the type, status and priority are chosen from the lists", () => {
	const result = parse({ ...form, type: "demolition", status: "lost", priority: "asap" });
	expect(result).toHaveProperty("issues");
	expect(result.issues).toHaveLength(3);
});

test("an order can't be made invoiced by hand", () => {
	expect(parse({ ...form, status: "invoiced" })).toHaveProperty("issues");
	expect(parse({ ...form, status: "completed" })).toHaveProperty("value.status", "completed");
});

describe("laborHours", () => {
	test("may be fractional or zero", () => {
		expect(parse({ ...form, laborHours: 0 })).toHaveProperty("value.laborHours", 0);
		expect(parse({ ...form, laborHours: 0.25 })).toHaveProperty("value.laborHours", 0.25);
	});

	test("can't be negative or left out", () => {
		expect(parse({ ...form, laborHours: -1 })).toEqual({ issues: ["Can't be negative"] });
		expect(parse({ ...form, laborHours: undefined })).toEqual({ issues: ["Enter the hours"] });
	});
});

describe("modules", () => {
	test("each module's part is validated by its schema", () => {
		const modules = { gadgets: { count: 2 } };
		expect(parse({ ...form, modules })).toHaveProperty("value.modules", modules);
		expect(parse({ ...form, modules: { gadgets: { count: 0 } } })).toEqual({
			issues: ["At least 1"],
		});
		expect(parse({ ...form, modules: { gadgets: "9" } })).toHaveProperty("issues");
	});

	test("without any, there are none", () => {
		expect(parse(form)).not.toHaveProperty("value.modules");
	});

	test("a part of no module is dropped", () => {
		expect(parse({ ...form, modules: { other: { x: "1" } } })).toHaveProperty("value.modules", {});
	});

	test("the browser checks the modules' parts before submitting, and leaves the rest to the server", async () => {
		const validate = (value: unknown) => orderFormPreflight["~standard"].validate(value);
		const bad = await validate({ ...form, description: "", modules: { gadgets: { count: 0 } } });
		expect(bad.issues?.map((issue) => issue.message)).toEqual(["At least 1"]);
		expect((await validate({ customerId: "", modules: { gadgets: { count: 1 } } })).issues).toBe(
			undefined,
		);
	});
});
