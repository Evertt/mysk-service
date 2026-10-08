import { describe, expect, test } from "vite-plus/test";

import { renderPathPattern, replacePathPattern } from "./messages.ts";
import { module, repoSettings } from "./test-helpers.ts";

describe("the inlang settings", () => {
	test("have their list left as it is when there are no modules", () => {
		const patterns = JSON.parse(repoSettings)["plugin.inlang.messageFormat"].pathPattern;
		expect(replacePathPattern(repoSettings, renderPathPattern(patterns, []))).toBe(repoSettings);
	});

	test("get the modules' files after the core's, by module and section", () => {
		const modules = [module("b", { sections: ["b2", "b1"] }), module("a", { sections: ["a"] })];
		const patterns = renderPathPattern(
			["./messages/{locale}/common.json", "./src/modules/gone/messages/{locale}/gone.json"],
			modules,
		);
		expect(patterns).toEqual([
			"./messages/{locale}/common.json",
			"./src/modules/b/messages/{locale}/b2.json",
			"./src/modules/b/messages/{locale}/b1.json",
			"./src/modules/a/messages/{locale}/a.json",
		]);
		const text = replacePathPattern(repoSettings, patterns);
		expect(JSON.parse(text)["plugin.inlang.messageFormat"].pathPattern).toEqual(patterns);
		expect(JSON.parse(text).locales).toEqual(["en", "nl"]);
	});
});
