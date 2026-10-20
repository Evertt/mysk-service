import { isHttpError, isValidationError } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { answerRefusal, Refused } from "#lib/server/refused.ts";

/** What `answerRefusal()` threw for `thrown`. */
function answer(thrown: unknown, kind: "form" | "call") {
	try {
		answerRefusal(thrown, kind);
	} catch (error) {
		return error;
	}
}

describe("Refused", () => {
	test("carries its problems, on their fields or the whole change", () => {
		const refused = new Refused({ path: ["name"], message: "Taken" }, "Choose something", {
			path: ["lines", 2, "quantity"],
			message: "Whole pieces only",
		});
		expect(refused.problems).toEqual([
			{ path: ["name"], message: "Taken" },
			{ message: "Choose something" },
			{ path: ["lines", 2, "quantity"], message: "Whole pieces only" },
		]);
		expect(refused.message).toBe("Taken; Choose something; Whole pieces only");
	});

	test("check() throws only when there are problems", () => {
		expect(() => Refused.check([])).not.toThrow();
		expect(() => Refused.check([{ path: ["email"], message: "Taken" }])).toThrow(Refused);
	});
});

describe("answerRefusal", () => {
	const refused = new Refused({ path: ["name"], message: "Taken" }, "And this");

	test("gives a form its problems as issues, each on its field", () => {
		const thrown = answer(refused, "form");
		expect(isValidationError(thrown)).toBe(true);
		expect(isValidationError(thrown) && thrown.issues).toEqual([
			{ path: ["name"], message: "Taken" },
			{ message: "And this" },
		]);
	});

	test("gives a command or query a 400 with the messages", () => {
		const thrown = answer(refused, "call");
		expect(isHttpError(thrown, 400)).toBe(true);
		expect(thrown).toMatchObject({ body: { message: "Taken; And this" } });
	});

	test("rethrows anything else", () => {
		const other = new Error("A bug");
		expect(answer(other, "form")).toBe(other);
	});
});
