/**
 * Whether the user manages the organization is the client's to ask, with `canManage()`
 * (`#lib/auth/can-manage.ts`, from the roles `getCurrentTenant()` has): a query sends its data, never
 * a `canManage` flag beside it. So the server's code (the remote files, every `server/` folder and
 * `*.server.ts`) never names `canManage`; where the server itself decides by the roles (what a
 * manager is sent), it asks `isManager(currentTenant().roles)`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** Whether `file` is the server's (a remote file, or server-only), and no test. */
const isServerCode = (file: string) =>
	/\.remote\.ts$|\.server\.ts$|\/server\//.test(file) && !file.includes("tests/");

/** The lines of `source` that name `canManage`. */
function canManageLines(source: string) {
	return source
		.split("\n")
		.flatMap((line, index) => (/\bcanManage\b/.test(line) ? [index + 1] : []));
}

test("no query sends canManage: the page asks canManage() from #lib/auth/can-manage.ts", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter((file) => file.endsWith(".ts") && isServerCode(file))
		.flatMap((file) =>
			canManageLines(readFileSync(join(root, file), "utf8")).map((line) => `${file}:${line}`),
		);
	expect(found).toEqual([]);
});

test("finds canManage in the server's code, as a field or a name", () => {
	expect(canManageLines("return {\n\tcanManage: isManager(roles),\n};")).toEqual([2]);
	expect(canManageLines("const canManage = isManager(roles);\nreturn { canManage };")).toEqual([
		1, 2,
	]);
	expect(canManageLines("const manager = isManager(roles);")).toEqual([]);
	expect(isServerCode("src/modules/energy/sites.remote.ts")).toBe(true);
	expect(isServerCode("src/lib/server/modules/settings.ts")).toBe(true);
	expect(isServerCode("src/modules/docks/server/docks.ts")).toBe(true);
	expect(isServerCode("src/lib/auth/can-manage.ts")).toBe(false);
	expect(isServerCode("src/modules/energy/tests/unit/server/sites.spec.ts")).toBe(false);
});
