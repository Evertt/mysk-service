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
			declaresSettings: /^\s*settings:/m.test(source),
			...graph,
			routeFiles: walk(join(dir, "routes")).filter((file) => posix.basename(file).startsWith("+")),
			// (The module's specs, test harnesses and end-to-end tests are in its `tests/` folder, which
			// the generator never reads: only `routes/`, `slots/`, `bulk-actions/`, `form-parts/`, `skeletons/`, `messages/`, ...)
			slotFiles: walk(join(dir, "slots"))
				.filter((file) => file.endsWith(".svelte"))
				.map((file) => `slots/${file}`),
			bulkFiles: walk(join(dir, "bulk-actions"))
				.filter((file) => file.endsWith(".ts"))
				.map((file) => `bulk-actions/${file}`),
			columnFiles: walk(join(dir, "columns"))
				.filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
				.map((file) => `columns/${file}`),
			serverColumnFiles: walk(join(dir, "server/columns"))
				.filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
				.map((file) => `server/columns/${file}`),
			formPartFiles: walk(join(dir, "form-parts"))
				.filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
				.map((file) => `form-parts/${file}`),
			skeletonFiles: walk(join(dir, "skeletons"))
				.filter((file) => file.endsWith(".svelte"))
				.map((file) => `skeletons/${file}`),
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
