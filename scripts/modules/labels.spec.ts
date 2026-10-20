import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { findLabelKinds, labelKey, planLabels, renderLabels } from "./labels.ts";
import { module } from "./test-helpers.ts";

const model = [
	"/**",
	" * In workflow order.",
	" * @labels contractStatus",
	" */",
	'const contractStatuses = ["upcoming", "active"] as const;',
	"export type ContractStatus = (typeof contractStatuses)[number];",
	"",
	"/** @labels dueRange dueRangeHint */",
	'export const dueRanges = ["overdue", "30-days"] as const;',
	"export type DueRange = (typeof dueRanges)[number];",
	"",
	"/** Mentions `@labels` in prose, which tags nothing. */",
	'export const others = ["a"] as const;',
].join("\n");

describe("labelKey", () => {
	test("is the prefix, the kind and the value in snake_case", () => {
		expect(labelKey("enum", "orderStatus", "in_progress")).toBe("enum_order_status_in_progress");
		expect(labelKey("maintenance_enum", "dueRange", "30-days")).toBe(
			"maintenance_enum_due_range_30_days",
		);
	});
});

describe("findLabelKinds", () => {
	test("reads the kinds each tagged array names, with its values and type alias", () => {
		expect(findLabelKinds("model.ts", model)).toEqual({
			kinds: [
				{
					kind: "contractStatus",
					values: ["upcoming", "active"],
					type: "ContractStatus",
					file: "model.ts",
				},
				{ kind: "dueRange", values: ["overdue", "30-days"], type: "DueRange", file: "model.ts" },
				{
					kind: "dueRangeHint",
					values: ["overdue", "30-days"],
					type: "DueRange",
					file: "model.ts",
				},
			],
			problems: [],
		});
	});

	test("refuses a tag on anything but a const array of strings with a type alias", () => {
		const source = [
			"/** @labels notConst */",
			'export const a = ["x"];',
			"/** @labels noType */",
			'export const b = ["x"] as const;',
			"/** @labels Bad-Kind */",
			'const c = ["x"] as const;',
			"export type C = (typeof c)[number];",
		].join("\n");
		expect(findLabelKinds("model.ts", source).problems).toEqual([
			'model.ts:1: @labels tags a `const xs = ["a", "b"] as const` of strings.',
			"model.ts:3: @labels needs `export type X = (typeof b)[number]`.",
			"model.ts:5: a label kind is camelCase, like `orderStatus`: Bad-Kind.",
		]);
	});
});

describe("renderLabels", () => {
	test("maps each value to its message, held to the array's type", () => {
		const { kinds } = findLabelKinds("model.ts", model);
		const source = renderLabels(
			{
				dir: "src/modules/contracts",
				prefix: "contracts_enum",
				specifier: (file) => `./${file}`,
				output: "src/modules/contracts/labels.gen.ts",
				labelsFrom: "#lib/i18n/index.ts",
			},
			kinds,
		);
		expect(source).toContain('import type { ContractStatus, DueRange } from "./model.ts";');
		expect(source).toContain(
			[
				"\tcontractStatus: {",
				"\t\tupcoming: m.contracts_enum_contract_status_upcoming,",
				"\t\tactive: m.contracts_enum_contract_status_active,",
				"\t} satisfies Labels<ContractStatus>,",
			].join("\n"),
		);
		expect(source).toContain('\t\t"30-days": m.contracts_enum_due_range_hint_30_days,');
	});
});

describe("planLabels", () => {
	let root: string;
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const write = (path: string, content: string) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	};

	test("writes the core's map and each tagging module's, under its message section", () => {
		root = mkdtempSync(join(tmpdir(), "labels-"));
		write(
			"src/lib/models.ts",
			'/** @labels weekday */\nexport const weekdays = ["monday"] as const;\nexport type Weekday = (typeof weekdays)[number];\n',
		);
		write("src/modules/partner-programme/model.ts", model);
		write("src/modules/partner-programme/tests/unit/model.ts", model.replace("dueRange", "x"));
		write("src/modules/schedule/model.ts", "export const x = 1;\n");
		const { files, problems } = planLabels(root, [
			module("partner-programme", { sections: ["partners"] }),
			module("schedule", { sections: ["schedule"] }),
		]);
		expect(problems).toEqual([]);
		expect(Object.keys(files)).toEqual([
			"src/lib/i18n/labels.gen.ts",
			"src/modules/partner-programme/labels.gen.ts",
		]);
		expect(files["src/lib/i18n/labels.gen.ts"]).toContain("monday: m.enum_weekday_monday,");
		expect(files["src/lib/i18n/labels.gen.ts"]).toContain(
			'import type { Weekday } from "#lib/models.ts";',
		);
		expect(files["src/modules/partner-programme/labels.gen.ts"]).toContain(
			"active: m.partners_enum_contract_status_active,",
		);
	});

	test("refuses two arrays that name one kind", () => {
		root = mkdtempSync(join(tmpdir(), "labels-"));
		write("src/modules/sample/a.ts", model);
		write("src/modules/sample/b.ts", model);
		const { problems } = planLabels(root, [module("sample", { sections: ["sample"] })]);
		expect(problems).toContain("src/modules/sample: two arrays name the label kind dueRange.");
	});
});
