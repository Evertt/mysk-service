import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { callers, checkCall, gates, outcome } from "#wiki/widgets/gate-table/gates.ts";

const gatesFile = readFileSync(
	join(import.meta.dirname, "../../../../lib/server/remote-functions.ts"),
	"utf8",
);

describe("the gate table", () => {
	test("every gate it lists is exported by the remote-functions file", () => {
		const missing = gates
			.map((gate) => gate.name)
			.filter((name) => !new RegExp(`^export const ${name}\\b`, "m").test(gatesFile));
		expect(missing, "a gate was renamed or removed: update gates.ts").toEqual([]);
	});

	test("every gate the file exports is in the table", () => {
		const exported = [...gatesFile.matchAll(/^export const (for[A-Z]\w*) = remoteSet\(/gm)].map(
			(match) => match[1],
		);
		expect(gates.map((gate) => gate.name).toSorted()).toEqual(exported.toSorted());
	});

	test("a planner reaches the office but not the settings, the engineer portal or the customer portal", () => {
		expect(outcome("forMembers", "planner")).toEqual({ admitted: true });
		expect(outcome("forManagers", "planner")).toEqual({ admitted: false, status: 403 });
		expect(outcome("forEngineers", "planner")).toEqual({ admitted: false, status: 403 });
		expect(outcome("forCustomers", "planner")).toEqual({ admitted: false, status: 403 });
	});

	test("a field engineer and a customer's contact are kept out of the office", () => {
		expect(outcome("forMembers", "engineer")).toEqual({ admitted: false, status: 403 });
		expect(outcome("forMembers", "customer")).toEqual({ admitted: false, status: 403 });
		expect(outcome("forEngineers", "engineer")).toEqual({ admitted: true });
		expect(outcome("forCustomers", "customer")).toEqual({ admitted: true });
		expect(outcome("forAnyRole", "engineer")).toEqual({ admitted: true });
	});

	test("without a session every gate but forAnyone says 401; without an organization, 403", () => {
		for (const { name } of gates) {
			expect(outcome(name, "anonymous")).toEqual(
				name === "forAnyone" ? { admitted: true } : { admitted: false, status: 401 },
			);
		}
		expect(outcome("forUsers", "bare")).toEqual({ admitted: true });
		expect(outcome("forAnyRole", "bare")).toEqual({ admitted: false, status: 403 });
		expect(outcome("forMembers", "bare")).toEqual({ admitted: false, status: 403 });
	});

	test("the developers' gate is a 404 for the roles, so it doesn't say its pages exist", () => {
		for (const { id } of callers) {
			if (id !== "anonymous") expect(outcome("forDevelopers", id)).toMatchObject({ status: 404 });
		}
	});

	test("every check it names is a function of the auth files", () => {
		const auth = [
			"../../../../lib/server/auth/session.ts",
			"../../../../lib/server/bug-reports/developers.ts",
		]
			.map((path) => readFileSync(join(import.meta.dirname, path), "utf8"))
			.join("\n");
		const missing = gates
			.flatMap((gate) => (gate.check ? [gate.check] : []))
			.filter((check) => !new RegExp(`\\bexport (?:function|const) ${check}\\b`).test(auth));
		expect(missing, "a check was renamed: update gates.ts").toEqual([]);
		expect(checkCall("requireMember")).toBe("requireMember()");
		expect(checkCall(null)).toBe("none");
	});

	test("each gate's check is the one the file passes to remoteSet()", () => {
		for (const { name, check } of gates) {
			const line = gatesFile.match(new RegExp(`^export const ${name} = remoteSet\\((.*?),`, "m"));
			if (!check) expect(line?.[1]).toBe("() => {}");
			else expect(line?.[1]).toBe(check);
		}
	});

	test("each gate says whom it admits, and none is listed twice", () => {
		expect(gates.every((gate) => gate.admits().length > 20)).toBe(true);
		expect(new Set(gates.map((gate) => gate.name)).size).toBe(gates.length);
	});
});
