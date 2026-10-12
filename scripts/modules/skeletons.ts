import { isGroup, MODULES_GROUP } from "./routes.ts";
import { GENERATED, type ModuleFolder } from "./shared.ts";

/**
 * The page a module's skeleton stands in for: `skeletons/(app)/schedule.svelte` is the one of
 * `routes/(app)/schedule/+page.svelte`, whose route id is `/(app)/(modules)/schedule`.
 */
export function skeletonPage(file: string) {
	const path = file.slice("skeletons/".length, -".svelte".length);
	const parts = path.split("/");
	const groups = parts.findIndex((part) => !isGroup(part));
	const routeId =
		groups === -1
			? undefined
			: `/${[...parts.slice(0, groups), MODULES_GROUP, ...parts.slice(groups)].join("/")}`;
	return { routeFile: `${path}/+page.svelte`, routeId };
}

/** The skeletons that stand in for no page of their module. */
export function skeletonProblems(modules: ModuleFolder[]) {
	return modules.flatMap((module) =>
		module.skeletonFiles
			.filter((file) => !module.routeFiles.includes(skeletonPage(file).routeFile))
			.map(
				(file) =>
					`src/modules/${module.id}/${file} is the skeleton of no page: ` +
					`routes/${skeletonPage(file).routeFile} doesn't exist.`,
			),
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
			routeId: skeletonPage(file).routeId!,
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
