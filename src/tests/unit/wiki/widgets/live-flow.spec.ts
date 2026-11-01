import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { codeParts } from "#wiki/code-parts.ts";
import { liveSteps } from "#wiki/widgets/live-flow/live-flow.ts";

const root = join(import.meta.dirname, "../../../../..");

describe("the live-update flow", () => {
	test("goes from the change, through the log and the feed, to the refresh", () => {
		expect(liveSteps.map((step) => step.id)).toEqual(["change", "log", "feed", "refresh"]);
	});

	test("every step's source is a file in the repository", () => {
		for (const { source } of liveSteps) expect(existsSync(join(root, source)), source).toBe(true);
	});

	test("it names recordActivity() and the shell's feed", () => {
		const text = liveSteps.map((step) => `${step.title()} ${step.detail()}`).join(" ");
		expect(text).toContain("recordActivity()");
		expect(text).toContain("refreshOnRecordChange()");
		expect(text).toMatch(/feed/);
	});

	test("the code in a step's text is what's between backticks", () => {
		expect(codeParts("calls `recordActivity()` in `tx`.")).toEqual([
			{ text: "calls ", code: false },
			{ text: "recordActivity()", code: true },
			{ text: " in ", code: false },
			{ text: "tx", code: true },
			{ text: ".", code: false },
		]);
	});
});
