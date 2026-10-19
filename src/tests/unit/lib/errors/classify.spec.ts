import { error } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { classify } from "#lib/errors/classify.ts";

/** What `error(status, message)` throws: SvelteKit's `HttpError`. */
const thrownBy = (status: number, message: string) => {
	try {
		error(status, message);
	} catch (caught) {
		return caught;
	}
};

describe("a refusal", () => {
	test("is http, keeping its status, whether thrown or as the App.Error a boundary gets", () => {
		expect(classify(thrownBy(404, "Order ORD-1 not found"))).toBe("http");
		expect(classify(thrownBy(403, "No"))).toBe("http");
		expect(classify({ status: 404, message: "Not Found", errorId: "x" })).toBe("http");
		expect(classify({ status: 400, message: "Bad Request" })).toBe("http");
	});

	test("with a 401 is a session that's gone", () => {
		expect(classify(thrownBy(401, "Not signed in"))).toBe("session");
		expect(classify({ status: 401, message: "Not signed in", errorId: "x" })).toBe("session");
	});

	test("wins over what the browser's hook made of it", () => {
		expect(classify({ status: 404, message: "Gone", kind: "unknown" })).toBe("http");
	});
});

describe("a failed fetch", () => {
	const failed = new TypeError("Failed to fetch");

	test("is offline when the browser is", () => {
		expect(classify(failed, { online: false })).toBe("offline");
	});

	test("is unknown when it's online", () => {
		expect(classify(failed, { online: true })).toBe("unknown");
		expect(classify(failed)).toBe("unknown");
	});
});

describe("a new version", () => {
	test("is a chunk that didn't load, in each browser's words", () => {
		for (const message of [
			"Failed to fetch dynamically imported module: https://app/_app/immutable/nodes/4.js",
			"Importing a module script failed.",
			"error loading dynamically imported module: https://app/_app/immutable/nodes/4.js",
		]) {
			expect(classify(new TypeError(message)), message).toBe("updated");
		}
	});

	test("is any unknown error once SvelteKit knows of one", () => {
		expect(classify(new Error("boom"), { updated: true })).toBe("updated");
		// A refusal is still one.
		expect(classify(thrownBy(404, "Gone"), { updated: true })).toBe("http");
	});
});

describe("anything else", () => {
	test("is unknown, whatever the browser calls reading undefined", () => {
		for (const message of [
			"Cannot read properties of undefined (reading 'name')",
			'can\'t access property "name", data is undefined',
			"undefined is not an object (evaluating 'data.name')",
		]) {
			expect(classify(new TypeError(message)), message).toBe("unknown");
		}
		expect(classify("a string")).toBe("unknown");
		expect(classify(undefined)).toBe("unknown");
	});

	test("is a server's 500 as its App.Error, which says no more", () => {
		expect(classify({ status: 500, message: "Internal Error", errorId: "x" })).toBe("unknown");
	});

	test("is what the browser's hook classified it as, when a boundary gets its App.Error", () => {
		expect(classify({ status: 500, message: "Internal Error", kind: "offline" })).toBe("offline");
		expect(classify({ status: 500, message: "Internal Error", kind: "updated" })).toBe("updated");
	});
});
