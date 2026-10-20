import { error } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { describeError, errorMessage } from "#lib/errors/messages.ts";

/** What `error(status, message)` throws. */
const thrownBy = (status: number, message: string) => {
	try {
		error(status, message);
	} catch (caught) {
		return caught;
	}
};

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

describe("a failed call's message", () => {
	const fallback = "Something went wrong";

	test("is a thrown error(status, message)'s own", () => {
		expect(errorMessage(thrownBy(404, "Order not found"), fallback)).toBe("Order not found");
	});

	test("is the fallback for a server's own failure: its message isn't the app's to show", () => {
		// What SvelteKit hands the browser for a handler that crashed, untranslated.
		expect(errorMessage(thrownBy(500, "Internal Error"), fallback)).toBe(fallback);
		// A proxy's error page: the message is its status text, empty over HTTP/2.
		expect(errorMessage(thrownBy(502, ""), fallback)).toBe(fallback);
		expect(errorMessage(thrownBy(409, ""), fallback)).toBe(fallback);
	});

	test("is the fallback for SvelteKit's own messages, as on the error page", () => {
		expect(errorMessage(thrownBy(404, "Not Found"), fallback)).toBe(fallback);
	});

	test("is the fallback for anything else", () => {
		expect(errorMessage(new Error("connection reset"), fallback)).toBe(fallback);
		expect(errorMessage("oops", fallback)).toBe(fallback);
		expect(errorMessage(undefined, fallback)).toBe(fallback);
	});
});
