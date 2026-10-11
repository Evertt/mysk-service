import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { orderFields, orderFormPreflight } from "#lib/orders/form/order-schema.ts";

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
	equipmentId: "11",
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
			equipmentId: 11,
			engineerId: 2,
			description: "Replace the pump seal",
			scheduledFor: new Date(2026, 9, 20),
		},
	});
});

test("an order for a new installation, not yet assigned or scheduled", () => {
	const order = { ...form, equipmentId: "", engineerId: "", scheduledFor: "", scheduledTime: "" };
	expect(parse(order)).toMatchObject({
		value: { equipmentId: null, engineerId: null, scheduledFor: null, scheduledTime: null },
	});
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
