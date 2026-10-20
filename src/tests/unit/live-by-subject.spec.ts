/**
 * A page stays up to date by the records it shows, live (`refreshOnChange()` on a live query, or
 * by record, `refreshOnRecordChange()`): the server's own code (every `server/` folder and `*.server.ts`) never
 * imports a remote file to refresh a query from a hook or a service. The exceptions below say why.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The server-only files that import a remote file still, and why. */
const allowed: Record<string, string> = {
	"src/modules/invoices/server/index.ts":
		"its orders.committed hook refreshes the billable card: invoices' own refresh batch",
	"src/modules/invoices/server/invoice-refresh.ts":
		"the refresh list of invoices and credit notes: invoices' own refresh batch",
};

/** Whether `file` is server-only, and no test. */
const isServerOnly = (file: string) =>
	/\.server\.ts$|\/server\//.test(file) && !file.includes("tests/");

/** The lines of `source` that import a remote file. */
function remoteImports(source: string) {
	return source
		.split("\n")
		.flatMap((line, index) => (/from "[^"]*\.remote\.ts"/.test(line) ? [index + 1] : []));
}

test("no server-only file imports a remote file: its page watches the record instead", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter((file) => file.endsWith(".ts") && isServerOnly(file) && !(file in allowed))
		.flatMap((file) =>
			remoteImports(readFileSync(join(root, file), "utf8")).map((line) => `${file}:${line}`),
		);
	expect(found).toEqual([]);
});

test("each exception still imports one", () => {
	const stale = Object.keys(allowed).filter(
		(file) => !remoteImports(readFileSync(join(root, file), "utf8")).length,
	);
	expect(stale).toEqual([]);
});

test("finds a remote file's import in server-only code", () => {
	expect(remoteImports('import { getX } from "../x.remote.ts";\nconst a = 1;')).toEqual([1]);
	expect(remoteImports('import { x } from "./x.ts";')).toEqual([]);
	expect(isServerOnly("src/modules/checklists/server/index.ts")).toBe(true);
	expect(isServerOnly("src/modules/invoices/api/revenue.server.ts")).toBe(true);
	expect(isServerOnly("src/modules/checklists/checklists.remote.ts")).toBe(false);
	expect(isServerOnly("src/modules/energy/tests/unit/server/sites.spec.ts")).toBe(false);
});
