import { existsSync, readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { sectionsOf } from "./messages.ts";
import { isGroup, MODULES_GROUP, routeFileKind, routePlace } from "./routes.ts";
import { byName, isGenerated, isLegacyStubFolder, type ModuleFolder, walk } from "./shared.ts";

const SECTION = /^[a-z][a-z0-9]*$/;
const ROUTE_FOLDER = /^[a-z][a-z0-9-]*$/;

/**
 * What's in `src/routes`, relative to it:
 *
 * - `core`: the core's top-level route folders (`(app)/orders`, `login`: those under groups count
 *   as top-level);
 * - `groups`: the `(modules)` folders, wherever they are (not those inside another): the
 *   generator's, which it deletes and rewrites;
 * - `foreign`: the files in those that the generator didn't write, which it refuses to delete;
 * - `legacy`: the stub folders of the generator's earlier versions, which put a module's route
 *   folder beside the core's with a `.gitignore` of its own, to remove.
 */
export function scanRoutes(root: string) {
	const routesDir = join(root, "src/routes");
	const core: string[] = [];
	const legacy: string[] = [];
	const visit = (relativeDir: string) => {
		for (const entry of readdirSync(join(routesDir, relativeDir), { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === MODULES_GROUP) continue;
			const path = posix.join(relativeDir, entry.name);
			if (isLegacyStubFolder(join(routesDir, path))) legacy.push(path);
			else if (isGroup(entry.name)) visit(path);
			else core.push(path);
		}
	};
	if (existsSync(routesDir)) visit("");

	const folders = existsSync(routesDir)
		? readdirSync(routesDir, { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) =>
					relative(routesDir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
				)
		: [];
	const groups = folders.filter((path) => {
		const parts = path.split("/");
		return parts.at(-1) === MODULES_GROUP && !parts.slice(0, -1).includes(MODULES_GROUP);
	});
	const foreign = groups.flatMap((group) =>
		walk(join(routesDir, group))
			.filter((file) => !posix.basename(file).startsWith("."))
			.filter((file) => !isGenerated(join(routesDir, group, file)))
			.map((file) => `src/routes/${group}/${file}`),
	);
	return {
		core: core.toSorted(byName),
		groups: groups.toSorted(byName),
		foreign,
		legacy: legacy.toSorted(byName),
	};
}

/** What's wrong with the `(modules)` folders' files that the generator didn't write. */
export const foreignProblems = (foreign: string[]) =>
	foreign.map(
		(file) =>
			`${file} wasn't written by scripts/modules.ts: every ${MODULES_GROUP} folder in src/routes is ` +
			`its own, which it deletes and rewrites, so the core can't use that name. Move the file out.`,
	);

/** What breaks the rules, as sentences; nothing when the modules are fine. */
export function checkModules(
	modules: ModuleFolder[],
	options: { coreRouteFolders: string[]; patterns: string[]; locales: string[] },
): string[] {
	const problems: string[] = [];
	const coreSegments = new Set(options.coreRouteFolders.map((folder) => posix.basename(folder)));
	/** The module that has a route segment, to refuse a second one. */
	const segmentOwner = new Map<string, string>();
	const sectionOwner = new Map<string, string>();
	for (const pattern of options.patterns) {
		const section = /^\.\/messages\/\{locale\}\/([\w-]+)\.json$/.exec(pattern)?.[1];
		if (section) sectionOwner.set(section, "the core");
	}

	for (const module of modules) {
		const where = `src/modules/${module.id}`;

		for (const file of module.routeFiles) {
			if (!routeFileKind(posix.basename(file))) {
				problems.push(`${where}/routes/${file} isn't a route file SvelteKit knows.`);
				continue;
			}
			if (file.split("/").includes(MODULES_GROUP)) {
				problems.push(
					`${where}/routes/${file}: ${MODULES_GROUP} is the group the generator links the routes ` +
						`into, so a module's routes can't use it.`,
				);
				continue;
			}
			const place = routePlace(file);
			if (!place) {
				problems.push(
					`${where}/routes/${file} is outside a route folder of its own: a module's routes live in ` +
						`folders it names itself (e.g. routes/(app)/${module.id}/…), never in the core's.`,
				);
				continue;
			}
			const segment = place.folder;
			const folder = [...place.groups, segment].join("/");
			if (!ROUTE_FOLDER.test(segment)) {
				problems.push(
					`${where}/routes/${folder}: a module's route folder is a plain name (${ROUTE_FOLDER}).`,
				);
			} else if (coreSegments.has(segment)) {
				problems.push(`${where}/routes/${folder} collides with the core's /${segment} route.`);
			} else if (segmentOwner.get(segment) && segmentOwner.get(segment) !== module.id) {
				problems.push(
					`${where}/routes/${folder} collides with the /${segment} route of the ${segmentOwner.get(segment)} module.`,
				);
			} else {
				segmentOwner.set(segment, module.id);
			}
		}

		const [first, ...others] = options.locales;
		for (const locale of others) {
			const have = module.messages[locale] ?? [];
			const expected = module.messages[first] ?? [];
			for (const section of expected.filter((s) => !have.includes(s))) {
				problems.push(`${where}/messages/${locale}/${section}.json is missing (${first} has it).`);
			}
			for (const section of have.filter((s) => !expected.includes(s))) {
				problems.push(`${where}/messages/${first}/${section}.json is missing (${locale} has it).`);
			}
		}
		for (const section of sectionsOf(module)) {
			if (!SECTION.test(section)) {
				problems.push(`${where}/messages: the section name "${section}" must match ${SECTION}.`);
			} else if (sectionOwner.has(section)) {
				problems.push(
					`${where}/messages: the section "${section}" is also ${sectionOwner.get(section)}'s: keys start with the section's name, so it must be unique.`,
				);
			} else {
				sectionOwner.set(section, `the ${module.id} module`);
			}
		}

		if (module.declaredId && module.declaredId !== module.id) {
			problems.push(
				`${where}/module.ts: its id is "${module.declaredId}", but the folder is "${module.id}".`,
			);
		}
	}
	return problems;
}
