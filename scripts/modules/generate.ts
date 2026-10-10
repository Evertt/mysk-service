import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { checkModules, foreignProblems, scanRoutes } from "./check.ts";
import { extensionProblems, findPoints, renderContributions } from "./extensions.ts";
import { discoverModules } from "./find.ts";
import { byDependency } from "./graph.ts";
import { renderPathPattern, replacePathPattern } from "./messages.ts";
import { renderRegistries } from "./registries.ts";
import { isGenerated, walk } from "./shared.ts";
import { planStubs } from "./stubs.ts";

/** Writes `file` unless it already has this content; through a rename, so readers never see half. */
function writeIfChanged(file: string, content: string) {
	if (existsSync(file) && readFileSync(file, "utf8") === content) return false;
	mkdirSync(dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	writeFileSync(temporary, content);
	renameSync(temporary, file);
	return true;
}

/** Makes `dir` hold exactly the `wanted` files (relative paths → content); returns what changed. */
function syncFolder(dir: string, wanted: Map<string, string>) {
	const changed: string[] = [];
	for (const file of walk(dir)) {
		if (wanted.has(file)) continue;
		rmSync(join(dir, file), { force: true });
		changed.push(join(dir, file));
	}
	for (const [file, content] of wanted) {
		if (writeIfChanged(join(dir, file), content)) changed.push(join(dir, file));
	}
	pruneEmptyFolders(dir);
	return changed;
}

/** Removes the empty folders under `dir` (those of files that are gone), deepest first. */
function pruneEmptyFolders(dir: string) {
	const folders = existsSync(dir)
		? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) =>
				entry.isDirectory(),
			)
		: [];
	for (const folder of folders.toSorted((a, b) => b.parentPath.length - a.parentPath.length)) {
		const path = join(folder.parentPath, folder.name);
		if (existsSync(path) && !readdirSync(path).length) rmSync(path, { recursive: true });
	}
}

/**
 * Brings everything the generator writes in line with the modules in `src/modules`. Throws, listing
 * every problem, when they break the rules. Returns the modules' ids and the files it wrote.
 */
export function generateModules(root: string) {
	const settingsFile = join(root, "project.inlang/settings.json");
	const settingsText = readFileSync(settingsFile, "utf8");
	const settings = JSON.parse(settingsText);
	const locales: string[] = settings.locales;
	const patterns: string[] = settings["plugin.inlang.messageFormat"].pathPattern;

	const { modules, problems } = discoverModules(root, locales);
	const routes = scanRoutes(root);
	problems.push(...foreignProblems(routes.foreign));
	problems.push(...checkModules(modules, { coreRouteFolders: routes.core, patterns, locales }));
	const points = findPoints(root);
	problems.push(...extensionProblems(points, modules));
	if (problems.length) {
		throw new Error(`The modules in src/modules break the rules:\n- ${problems.join("\n- ")}`);
	}

	const changed: string[] = [];
	const write = (path: string, content: string) => {
		if (writeIfChanged(join(root, path), content)) changed.push(path);
	};
	const ordered = byDependency(modules);
	for (const [path, content] of Object.entries(renderRegistries(ordered))) write(path, content);
	write("src/lib/extensions/contributions.gen.ts", renderContributions(points, ordered));
	write(
		"project.inlang/settings.json",
		replacePathPattern(settingsText, renderPathPattern(patterns, modules)),
	);

	for (const folder of routes.legacy) {
		const dir = join(root, "src/routes", folder);
		changed.push(...removeLegacyStubs(dir).map((file) => relative(root, file)));
	}
	const stubs = planStubs(root, modules);
	for (const group of routes.groups.filter((group) => !stubs.has(group))) {
		rmSync(join(root, "src/routes", group), { recursive: true, force: true });
		changed.push(`src/routes/${group}`);
	}
	for (const [group, files] of stubs) {
		const dir = join(root, "src/routes", group);
		changed.push(...syncFolder(dir, files).map((file) => relative(root, file)));
	}
	return { modules: modules.map((module) => module.id), changed };
}

/**
 * Removes what the generator's earlier versions wrote in a stub folder beside the core's route
 * folders (`src/routes/(app)/contracts`): its `.gitignore` and the stubs, then the folders that
 * are left empty. Anything else in it stays. Returns what it removed.
 */
function removeLegacyStubs(dir: string) {
	const removed = walk(dir)
		.filter((file) => file === ".gitignore" || isGenerated(join(dir, file)))
		.map((file) => join(dir, file));
	for (const file of removed) rmSync(file);
	pruneEmptyFolders(dir);
	if (existsSync(dir) && !readdirSync(dir).length) rmSync(dir, { recursive: true });
	return removed;
}
