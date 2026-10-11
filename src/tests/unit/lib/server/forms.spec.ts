import { isValidationError } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { refuse } from "#lib/server/forms.ts";

/** Like the `issue` of a remote form: a function per field that makes an issue for it. */
const issue = {
	name: (message: string) => ({ message, path: ["name"] }),
	email: (message: string) => ({ message, path: ["email"] }),
};

/** The issues `refuse` throws, or `undefined` if it doesn't. */
function refusal(problems: Parameters<typeof refuse<"name" | "email">>[1]) {
	try {
		refuse(issue, problems);
	} catch (error) {
		if (isValidationError(error)) return error.issues;
		throw error;
	}
}

describe("refuse", () => {
	test("does nothing without problems", () => {
		expect(refusal([])).toBeUndefined();
	});

	test("refuses with each problem on its field", () => {
		expect(
			refusal([
				{ field: "name", message: "Taken" },
				{ field: "email", message: "Not an address" },
			]),
		).toEqual([
			{ message: "Taken", path: ["name"] },
			{ message: "Not an address", path: ["email"] },
		]);
	});

	test("puts a problem without a field on the form", () => {
		expect(refusal([{ message: "Choose something" }])).toEqual([{ message: "Choose something" }]);
	});
});
