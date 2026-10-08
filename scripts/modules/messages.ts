import type { ModuleFolder } from "./shared.ts";

const MODULE_MESSAGES = "./src/modules/";

/** The message sections of a module, e.g. `["contracts"]` (those of its first language). */
export const sectionsOf = (module: ModuleFolder) => Object.values(module.messages)[0] ?? [];

/** The inlang `pathPattern`: the core's entries as they were, then each module's, in id order. */
export function renderPathPattern(existing: string[], modules: ModuleFolder[]): string[] {
	return [
		...existing.filter((pattern) => !pattern.startsWith(MODULE_MESSAGES)),
		...modules.flatMap((module) =>
			sectionsOf(module).map(
				(section) => `${MODULE_MESSAGES}${module.id}/messages/{locale}/${section}.json`,
			),
		),
	];
}

/** `settings.json`'s text with `pathPattern` replaced, leaving the rest of the file as it is. */
export function replacePathPattern(settings: string, patterns: string[]): string {
	const pattern = /^(\t*)"pathPattern": \[[^\]]*\]/m;
	const match = pattern.exec(settings);
	if (!match) throw new Error(`project.inlang/settings.json has no "pathPattern" list.`);
	const indent = match[1];
	const entries = patterns.map((entry) => `${indent}\t${JSON.stringify(entry)}`).join(",\n");
	return settings.replace(pattern, () => `${indent}"pathPattern": [\n${entries}\n${indent}]`);
}
