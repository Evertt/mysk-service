import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { sectionsOf } from "./messages.ts";
import { routeFileKind, topFolder } from "./routes.ts";
import { byName, GENERATED, type ModuleFolder } from "./shared.ts";

const SECTION = /^[a-z][a-z0-9]*$/;
const ROUTE_FOLDER = /^[a-z][a-z0-9-]*$/;

const isGroup = (name: string) => /^\(.*\)$/.test(name);

function hasMarker(dir: string) {
	const file = join(dir, ".gitignore");
	return existsSync(file) && readFileSync(file, "utf8").startsWith(`# ${GENERATED}`);
}

/**
 * The top-level route folders under `src/routes` (`(app)/orders`, `login`: those under groups
 * count as top-level), split into the ones the generator made and the core's own.
 */
export function scanRoutes(root: string) {
	const stubs: string[] = [];
	const core: string[] = [];
	const visit = (relativeDir: string) => {
		const dir = join(root, "src/routes", relativeDir);
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const path = posix.join(relativeDir, entry.name);
			if (hasMarker(join(dir, entry.name))) stubs.push(path);
			else if (isGroup(entry.name)) visit(path);
			else core.push(path);
		}
	};
	visit("");
	return { stubs: stubs.toSorted(byName), core: core.toSorted(byName) };
}

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
			const split = topFolder(file);
			if (!split) {
				problems.push(
					`${where}/routes/${file} is outside a route folder of its own: a module's routes live in ` +
						`folders it names itself (e.g. routes/(app)/${module.id}/…), never in the core's.`,
				);
				continue;
			}
			const segment = posix.basename(split.folder);
			if (!ROUTE_FOLDER.test(segment)) {
				problems.push(
					`${where}/routes/${split.folder}: a module's route folder is a plain name (${ROUTE_FOLDER}).`,
				);
			} else if (coreSegments.has(segment)) {
				problems.push(
					`${where}/routes/${split.folder} collides with the core's /${segment} route.`,
				);
			} else if (segmentOwner.get(segment) && segmentOwner.get(segment) !== module.id) {
				problems.push(
					`${where}/routes/${split.folder} collides with the /${segment} route of the ${segmentOwner.get(segment)} module.`,
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
