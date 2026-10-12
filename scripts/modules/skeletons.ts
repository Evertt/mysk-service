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
 * The registry of the modules' skeletons, `src/lib/modules/skeletons.gen.ts`. It imports them
 * statically, so they're in the office's bundle for every tenant: they're small, and a component
 * module that comes in during a navigation trips Svelte (5.57) up.
 */
export function renderSkeletons(modules: ModuleFolder[]) {
	const entries = modules.flatMap((module) =>
		module.skeletonFiles.map((file, index) => ({
			module: module.id,
			file,
			name: `${module.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}Skeleton${index}`,
			routeId: skeletonPage(file).routeId!,
		})),
	);
	return [
		`// ${GENERATED} from src/modules/*/skeletons/. Don't edit.`,
		`import type { Component } from "svelte";`,
		"",
		...entries.map(
			(entry) => `import ${entry.name} from "#modules/${entry.module}/${entry.file}";`,
		),
		...(entries.length ? [""] : []),
		`/** What the modules' pages show while they load, by route id (\`src/routes/(app)/page-skeleton.ts\`). */`,
		`export const moduleSkeletons: { module: string; routeId: string; skeleton: Component }[] = ${
			entries.length
				? `[\n${entries
						.map(
							(entry) =>
								`\t{ module: ${JSON.stringify(entry.module)}, routeId: ${JSON.stringify(entry.routeId)}, skeleton: ${entry.name} },`,
						)
						.join("\n")}\n]`
				: "[]"
		};`,
		"",
	].join("\n");
}
