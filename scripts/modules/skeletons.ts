import { posix } from "node:path";

import { MODULES_GROUP, routePlace } from "./routes.ts";
import { GENERATED, type ModuleFolder } from "./shared.ts";

/** The name of a skeleton's file: the `+page.svelte` it stands in for, without the `+`. */
const SKELETON = "page.svelte";

/**
 * The page a module's skeleton stands in for: the one at the same path in `routes/`, with
 * `page.svelte` for `+page.svelte`. The schedule's `skeletons/(app)/page.svelte` is the one of
 * `routes/(app)/+page.svelte`, whose route id is `/(app)/(modules)/schedule`; a skeleton of
 * `routes/(app)/[number]/+page.svelte` would be `skeletons/(app)/[number]/page.svelte`.
 */
export function skeletonPage(id: string, file: string) {
	const path = file.slice("skeletons/".length);
	const routeFile = `${path.slice(0, -SKELETON.length)}+page.svelte`;
	const place = routePlace(routeFile);
	const rest = place && posix.dirname(place.rest);
	const routeId = place
		? `/${[...place.groups, MODULES_GROUP, id, ...(rest === "." ? [] : [rest])].join("/")}`
		: undefined;
	return { routeFile, routeId };
}

/** The skeletons that stand in for no page of their module, or aren't named for one. */
export function skeletonProblems(modules: ModuleFolder[]) {
	return modules.flatMap((module) =>
		module.skeletonFiles.flatMap((file) => {
			const where = `src/modules/${module.id}/${file}`;
			if (posix.basename(file) !== SKELETON) {
				return [
					`${where}: a skeleton is a ${SKELETON}, at the path of its page's +page.svelte in routes/.`,
				];
			}
			const { routeFile } = skeletonPage(module.id, file);
			return module.routeFiles.includes(routeFile)
				? []
				: [`${where} is the skeleton of no page: routes/${routeFile} doesn't exist.`];
		}),
	);
}

/**
 * The registry of the modules' skeletons, `src/lib/modules/skeletons.gen.ts`. It lists a loader
 * for each, so a tenant's office loads only its modules' skeletons, after the layout mounts
 * (`loadModuleSkeletons()`). One that comes in while a navigation is pending can trip Svelte (5.57)
 * up ("Batch has scheduled effects"); see "Skeletons" in `AGENTS.md`.
 */
export function renderSkeletons(modules: ModuleFolder[]) {
	const entries = modules.flatMap((module) =>
		module.skeletonFiles.map((file) => ({
			module: module.id,
			file,
			routeId: skeletonPage(module.id, file).routeId!,
		})),
	);
	return [
		`// ${GENERATED} from src/modules/*/skeletons/. Don't edit.`,
		`import type { Component } from "svelte";`,
		"",
		`/** What the modules' pages show while they load, by route id (\`src/routes/(app)/page-skeleton.ts\`). */`,
		`export const moduleSkeletons: {\n\tmodule: string;\n\trouteId: string;\n\tload: () => Promise<{ default: Component }>;\n}[] = ${
			entries.length
				? `[\n${entries
						.map(
							(entry) =>
								`\t{\n\t\tmodule: ${JSON.stringify(entry.module)},\n\t\trouteId: ${JSON.stringify(entry.routeId)},\n\t\tload: () => import(${JSON.stringify(`#modules/${entry.module}/${entry.file}`)}),\n\t},`,
						)
						.join("\n")}\n]`
				: "[]"
		};`,
		"",
	].join("\n");
}
