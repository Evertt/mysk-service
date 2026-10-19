import { describe, expect, test } from "vite-plus/test";

import { describeError } from "#lib/errors/messages.ts";

describe("a refusal's text", () => {
	test("is the app's own message, which says more than ours, also for a 403", () => {
		const notMember = { status: 403, message: "You're not a member of any organization" };
		expect(describeError(notMember, "http")).toEqual({
			title: "No access",
			text: "You're not a member of any organization",
		});
		expect(describeError({ status: 404, message: "Order ORD-1 not found" }, "http").text).toBe(
			"Order ORD-1 not found",
		);
	});

	test("is ours for SvelteKit's own messages", () => {
		expect(describeError({ status: 403, message: "Forbidden" }, "http").text).toBe(
			"You don't have access to this.",
		);
		expect(describeError({ status: 404, message: "Not Found" }, "http").text).toBe(
			"This doesn't exist (anymore).",
		);
	});
});
