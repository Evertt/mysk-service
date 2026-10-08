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

import { checkModules, scanRoutes } from "./check.ts";
import { discoverModules } from "./find.ts";
import { renderPathPattern, replacePathPattern } from "./messages.ts";
import { renderRegistries } from "./registries.ts";
import { walk } from "./shared.ts";
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
	// The folders of files that are gone, deepest first.
	const folders = existsSync(dir)
		? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) =>
				entry.isDirectory(),
			)
		: [];
	for (const folder of folders.toSorted((a, b) => b.parentPath.length - a.parentPath.length)) {
		const path = join(folder.parentPath, folder.name);
		if (existsSync(path) && !readdirSync(path).length) rmSync(path, { recursive: true });
	}
	return changed;
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
	problems.push(...checkModules(modules, { coreRouteFolders: routes.core, patterns, locales }));
	if (problems.length) {
		throw new Error(`The modules in src/modules break the rules:\n- ${problems.join("\n- ")}`);
	}

	const changed: string[] = [];
	const write = (path: string, content: string) => {
		if (writeIfChanged(join(root, path), content)) changed.push(path);
	};
	for (const [path, content] of Object.entries(renderRegistries(modules))) write(path, content);
	write(
		"project.inlang/settings.json",
		replacePathPattern(settingsText, renderPathPattern(patterns, modules)),
	);

	const stubs = planStubs(root, modules);
	for (const folder of routes.stubs.filter((folder) => !stubs.has(folder))) {
		rmSync(join(root, "src/routes", folder), { recursive: true, force: true });
		changed.push(`src/routes/${folder}`);
	}
	for (const [folder, files] of stubs) {
		const dir = join(root, "src/routes", folder);
		changed.push(...syncFolder(dir, files).map((file) => relative(root, file)));
	}
	return { modules: modules.map((module) => module.id), changed };
}
