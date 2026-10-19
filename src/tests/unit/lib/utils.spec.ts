import { error } from "@sveltejs/kit";
import { expect, test } from "vite-plus/test";

import { errorMessage } from "#lib/utils.ts";

/** What `error(status, message)` throws. */
const thrownBy = (status: number, message: string) => {
	try {
		error(status, message);
	} catch (caught) {
		return caught;
	}
};

test("a thrown error(status, message) gives its message", () => {
	expect(errorMessage(thrownBy(404, "Order not found"), "Something went wrong")).toBe(
		"Order not found",
	);
});

test("a server's own failure gives the fallback: its message isn't the app's to show", () => {
	// What SvelteKit hands the browser for a handler that crashed, untranslated.
	expect(errorMessage(thrownBy(500, "Internal Error"), "Something went wrong")).toBe(
		"Something went wrong",
	);
	// A proxy's error page: the message is its status text, empty over HTTP/2.
	expect(errorMessage(thrownBy(502, ""), "Something went wrong")).toBe("Something went wrong");
	expect(errorMessage(thrownBy(409, ""), "Something went wrong")).toBe("Something went wrong");
});

test("anything else gives the fallback", () => {
	expect(errorMessage(new Error("connection reset"), "Something went wrong")).toBe(
		"Something went wrong",
	);
	expect(errorMessage("oops", "Something went wrong")).toBe("Something went wrong");
	expect(errorMessage(undefined, "Something went wrong")).toBe("Something went wrong");
});
