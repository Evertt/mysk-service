import { error } from "@sveltejs/kit";
import { expect, test } from "vite-plus/test";

import { errorMessage } from "./utils.js";

test("a thrown error(status, message) gives its message", () => {
	const thrown = (() => {
		try {
			error(404, "Order not found");
		} catch (caught) {
			return caught;
		}
	})();

	expect(errorMessage(thrown, "Something went wrong")).toBe("Order not found");
});

test("anything else gives the fallback", () => {
	expect(errorMessage(new Error("connection reset"), "Something went wrong")).toBe(
		"Something went wrong",
	);
	expect(errorMessage("oops", "Something went wrong")).toBe("Something went wrong");
	expect(errorMessage(undefined, "Something went wrong")).toBe("Something went wrong");
});
