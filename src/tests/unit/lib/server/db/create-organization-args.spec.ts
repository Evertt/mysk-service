import { describe, expect, test } from "vite-plus/test";

import { fakeGraph } from "#lib/modules/fakes.ts";
import { moduleIds } from "#lib/modules/ids.ts";

import { parseCreateArgs, UsageError } from "./create-organization-args.ts";

const args = [
	"--org",
	"Acme Service",
	"--slug",
	"acme",
	"--owner-email",
	"Ada@Acme.example",
	"--owner-name",
	"Ada Lovelace",
];

/** What's wrong with a command line (read with `graph`, if given), or `undefined` if nothing is. */
const problem = (line: string[], graph?: typeof fakeGraph) => {
	try {
		parseCreateArgs(line, graph);
	} catch (error) {
		if (error instanceof UsageError) return error.message;
		throw error;
	}
};

test("the options become an organization and its owner", () => {
	expect(parseCreateArgs(args)).toEqual({
		org: "Acme Service",
		slug: "acme",
		ownerEmail: "ada@acme.example",
		ownerName: "Ada Lovelace",
		modules: [],
	});
});

test("the `--` that `pnpm run` passes on is skipped, and `=` works too", () => {
	expect(parseCreateArgs(["--", ...args])).toHaveProperty("slug", "acme");
	expect(parseCreateArgs([...args.slice(2), "--org=Acme Service"])).toHaveProperty(
		"org",
		"Acme Service",
	);
});

test("--help asks for the usage", () => {
	expect(parseCreateArgs(["--help"])).toBe("help");
	expect(parseCreateArgs(["--", "-h"])).toBe("help");
});

test("every option but the modules is required", () => {
	expect(problem([])?.split("\n")).toEqual([
		"--org is required",
		"--slug is required",
		"--owner-email is required",
		"--owner-name is required",
	]);
	expect(problem([...args.slice(0, 6), "--owner-name", "  "])).toBe("--owner-name is required");
});

describe("checks", () => {
	test.each(["Acme", "acme service", "-acme", "acme-", "acme--service", "åcme"])(
		"refuses the slug %j",
		(slug) => {
			expect(problem([...args.slice(0, 2), `--slug=${slug}`, ...args.slice(4)])).toMatch(/^--slug/);
		},
	);

	test.each(["acme", "acme-service-2", "42"])("accepts the slug %j", (slug) => {
		expect(problem([...args.slice(0, 2), `--slug=${slug}`, ...args.slice(4)])).toBeUndefined();
	});

	test("refuses an email address that isn't one", () => {
		expect(problem([...args.slice(0, 4), "--owner-email", "ada", ...args.slice(6)])).toBe(
			"--owner-email isn't an email address",
		);
	});

	test("refuses unknown options and arguments", () => {
		expect(problem([...args, "--owner", "x"])).toMatch(/--owner/);
		expect(problem([...args, "extra"])).toBe("Unexpected argument: extra");
		expect(problem([...args, "--slug"])).toMatch(/--slug/);
	});
});

describe("modules", () => {
	test("are a comma-separated list, without duplicates", () => {
		expect(
			parseCreateArgs([...args, "--modules", "contracts, invoicing,contracts"]),
		).toHaveProperty("modules", ["contracts", "invoicing"]);
	});

	test("must exist", () => {
		expect(problem([...args, "--modules", "contracts,payroll"])).toBe(
			`Unknown modules: payroll (there are ${moduleIds.join(", ")})`,
		);
	});

	test("are the modules there are", () => {
		expect(parseCreateArgs([...args, "--modules", moduleIds.join(",")])).toHaveProperty("modules", [
			...moduleIds,
		]);
	});

	test("come with what they require, or are refused", () => {
		expect(problem([...args, "--modules", "extra"], fakeGraph)).toBe(
			"--modules: extra requires addon; add it to --modules",
		);
		expect(problem([...args, "--modules", "addon,extra"], fakeGraph)).toBe(
			"--modules: addon requires base; add it to --modules",
		);
		expect(parseCreateArgs([...args, "--modules", "addon,base"], fakeGraph)).toHaveProperty(
			"modules",
			["base", "addon"],
		);
	});

	test("leave out always-on ones, which are on anyway", () => {
		expect(parseCreateArgs([...args, "--modules", "core-ish,side"], fakeGraph)).toHaveProperty(
			"modules",
			["side"],
		);
	});

	test("are checked against the graph's modules", () => {
		expect(problem([...args, "--modules", "contracts"], fakeGraph)).toBe(
			"Unknown modules: contracts (there are base, addon, core-ish, extra, side)",
		);
	});
});
