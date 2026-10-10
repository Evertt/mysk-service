import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { readManifestGraph } from "./manifest.ts";
import { byName, type ModuleFolder, walk } from "./shared.ts";

const MODULE_ID = /^[a-z][a-z0-9-]*$/;

/** The folders under `src/modules` with a `module.ts`, and what's wrong with the ones without. */
export function discoverModules(root: string, locales: string[]) {
	const modulesDir = join(root, "src/modules");
	const modules: ModuleFolder[] = [];
	const problems: string[] = [];
	if (!existsSync(modulesDir)) return { modules, problems };

	const folders = readdirSync(modulesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.toSorted(byName);
	for (const id of folders) {
		const dir = join(modulesDir, id);
		if (!existsSync(join(dir, "module.ts"))) {
			if (readdirSync(dir).some((name) => !name.startsWith("."))) {
				problems.push(`src/modules/${id} has no module.ts, so it isn't a module.`);
			}
			continue;
		}
		if (!MODULE_ID.test(id)) {
			problems.push(`src/modules/${id}: a module's folder name is its id: ${MODULE_ID}.`);
		}
		const hasFile = (path: string) => existsSync(join(dir, path));
		const sections = (locale: string) =>
			walk(join(dir, "messages", locale))
				.filter((file) => !file.includes("/") && file.endsWith(".json"))
				.map((file) => file.slice(0, -".json".length));
		const source = readFileSync(join(dir, "module.ts"), "utf8");
		const { problems: graphProblems, ...graph } = readManifestGraph(source);
		for (const problem of graphProblems) problems.push(`src/modules/${id}/module.ts: ${problem}`);
		modules.push({
			id,
			declaredId: /\bid:\s*["'`]([^"'`]+)["'`]/.exec(source)?.[1],
			...graph,
			routeFiles: walk(join(dir, "routes")).filter((file) => posix.basename(file).startsWith("+")),
			// Components and scripts, not the specs and test harnesses next to them.
			slotFiles: walk(join(dir, "slots"))
				.filter((file) => file.endsWith(".svelte") && !file.endsWith(".test-harness.svelte"))
				.map((file) => `slots/${file}`),
			bulkFiles: walk(join(dir, "bulk-actions"))
				.filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
				.map((file) => `bulk-actions/${file}`),
			server: {
				index: hasFile("server/index.ts"),
				schema: hasFile("server/schema.ts"),
				seed: hasFile("server/seed.ts"),
			},
			messages: Object.fromEntries(locales.map((locale) => [locale, sections(locale)])),
		});
	}
	return { modules, problems };
}
