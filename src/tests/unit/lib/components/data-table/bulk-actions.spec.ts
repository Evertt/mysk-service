import { describe, expect, test } from "vite-plus/test";

import {
	actionsForRow,
	applicability,
	type BulkAction,
	summarizeBulkResult,
} from "#lib/components/data-table/bulk-actions.ts";

interface Row {
	number: string;
	status: "open" | "invoiced";
	customer: number;
}

const rows: Row[] = [
	{ number: "ORD-1", status: "open", customer: 1 },
	{ number: "ORD-2", status: "invoiced", customer: 1 },
	{ number: "ORD-3", status: "open", customer: 2 },
];

const notInvoiced: Pick<BulkAction<Row>, "skip"> = {
	skip: (row) => (row.status === "invoiced" ? `${row.number} is invoiced` : undefined),
};

describe("which selected rows an action applies to", () => {
	test("all of them, without a rule", () => {
		const result = applicability({}, rows);
		expect(result.applies).toEqual(rows);
		expect(result.skipped).toEqual([]);
		expect(result.disabled).toBeUndefined();
	});

	test("those its rule doesn't skip, with the reason for the others", () => {
		const result = applicability(notInvoiced, rows);
		expect(result.applies.map((row) => row.number)).toEqual(["ORD-1", "ORD-3"]);
		expect(result.skipped).toEqual([{ row: rows[1], reason: "ORD-2 is invoiced" }]);
		expect(result.disabled).toBeUndefined();
	});

	test("none: it's disabled, with the first row's reason", () => {
		const result = applicability(notInvoiced, [rows[1]]);
		expect(result.applies).toEqual([]);
		expect(result.disabled).toBe("ORD-2 is invoiced");
	});

	test("a rule on the selection as a whole disables it, whatever the rows", () => {
		const oneCustomer: Pick<BulkAction<Row>, "disabled"> = {
			disabled: (selected) =>
				new Set(selected.map((row) => row.customer)).size > 1 ? "One customer" : undefined,
		};
		expect(applicability(oneCustomer, rows).disabled).toBe("One customer");
		expect(applicability(oneCustomer, rows.slice(0, 2)).disabled).toBeUndefined();
	});

	test("with all matching rows selected, the shown ones don't disable it", () => {
		expect(applicability(notInvoiced, [rows[1]], true).disabled).toBeUndefined();
	});

	test("an action that can't act on all matching rows is disabled then", () => {
		const result = applicability({ ...notInvoiced, matching: false }, rows, true);
		expect(result.disabled).toBe("Not for all matching rows: select rows on this page instead");
		expect(applicability({ matching: false }, rows).disabled).toBeUndefined();
	});
});

describe("how a result reads", () => {
	test("everything done", () => {
		expect(summarizeBulkResult({ done: 7, skipped: [], missing: 0 })).toEqual({
			tone: "success",
			title: "7 updated",
			details: [],
		});
	});

	test("with what was done", () => {
		const deleted = summarizeBulkResult(
			{ done: 2, skipped: [], missing: 0 },
			({ count }) => `${count} deleted`,
		);
		expect(deleted.title).toBe("2 deleted");
	});

	test("some skipped: the reasons, with the record's label where they lack it", () => {
		const summary = summarizeBulkResult({
			done: 7,
			skipped: [
				{ label: "ORD-2", reason: "ORD-2 is invoiced" },
				{ label: "MAT-9", reason: "It's used on 3 orders" },
			],
			missing: 0,
		});
		expect(summary).toEqual({
			tone: "warning",
			title: "7 updated, 2 skipped",
			details: ["ORD-2 is invoiced", "MAT-9: It's used on 3 orders"],
		});
	});

	test("nothing done", () => {
		const summary = summarizeBulkResult({
			done: 0,
			skipped: [{ label: "ORD-2", reason: "ORD-2 is invoiced" }],
			missing: 1,
		});
		expect(summary.tone).toBe("error");
		expect(summary.title).toBe("1 skipped, 1 not found");
	});

	test("records not found (deleted meanwhile, or not the tenant's)", () => {
		const summary = summarizeBulkResult({ done: 3, skipped: [], missing: 2 });
		expect(summary).toEqual({ tone: "warning", title: "3 updated, 2 not found", details: [] });
	});

	test("lists the first five reasons and counts the rest", () => {
		const skipped = Array.from({ length: 8 }, (_, i) => ({
			label: `ORD-${i}`,
			reason: `ORD-${i} is invoiced`,
		}));
		const { details } = summarizeBulkResult({ done: 0, skipped, missing: 0 });
		expect(details).toHaveLength(6);
		expect(details.at(-1)).toBe("and 3 more");
	});

	test("formats the numbers", () => {
		expect(summarizeBulkResult({ done: 1234, skipped: [], missing: 0 }).title).toBe(
			"1,234 updated",
		);
	});
});

describe("which actions a row's menu offers", () => {
	const action = (id: string, rules: Partial<BulkAction<Row>> = {}): BulkAction<Row> => ({
		id,
		label: () => id,
		run: async () => ({ done: 1, skipped: [], missing: 0 }),
		...rules,
	});

	test("those that apply to the row", () => {
		const actions = [action("assign", notInvoiced), action("delete")];
		expect(actionsForRow(actions, rows[0]).map((a) => a.id)).toEqual(["assign", "delete"]);
		expect(actionsForRow(actions, rows[1]).map((a) => a.id)).toEqual(["delete"]);
	});

	test("not those the row rules out as a whole", () => {
		const firstCustomer = action("invoice", {
			disabled: (selection) =>
				selection.every((row) => row.customer === 1) ? undefined : "Another customer",
		});
		expect(actionsForRow([firstCustomer], rows[0])).toEqual([firstCustomer]);
		expect(actionsForRow([firstCustomer], rows[2])).toEqual([]);
	});

	test("not those that opt out of rows", () => {
		expect(actionsForRow([action("merge", { row: false })], rows[0])).toEqual([]);
	});

	test("those that don't act on all matching rows still act on one", () => {
		expect(actionsForRow([action("invoice", { matching: false })], rows[0])).toHaveLength(1);
	});
});

describe("how a result reads for a single row", () => {
	const deleted = ({ count }: { count: string }) => `${count} deleted`;

	test("done: names the row", () => {
		expect(summarizeBulkResult({ done: 1, skipped: [], missing: 0 }, undefined, "ORD-1")).toEqual({
			tone: "success",
			title: "ORD-1 updated",
			details: [],
		});
		expect(summarizeBulkResult({ done: 1, skipped: [], missing: 0 }, deleted, "ORD-1").title).toBe(
			"ORD-1 deleted",
		);
	});

	test("skipped: says why", () => {
		const skipped = (reason: string) =>
			summarizeBulkResult(
				{ done: 0, skipped: [{ label: "ORD-2", reason }], missing: 0 },
				undefined,
				"ORD-2",
			);
		expect(skipped("ORD-2 is invoiced")).toEqual({
			tone: "error",
			title: "ORD-2 is invoiced",
			details: [],
		});
		expect(skipped("It's used on orders").title).toBe("ORD-2: It's used on orders");
	});

	test("not found (deleted meanwhile, or not the tenant's)", () => {
		expect(summarizeBulkResult({ done: 0, skipped: [], missing: 1 }, undefined, "ORD-3")).toEqual({
			tone: "error",
			title: "ORD-3 not found",
			details: [],
		});
	});
});
