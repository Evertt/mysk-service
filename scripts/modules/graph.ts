import { byName, type ModuleFolder } from "./shared.ts";

/** The ids `module` requires that are modules of their own, i.e. the edges the order follows. */
const edges = (module: ModuleFolder, ids: Set<string>) =>
	module.requires.filter((id) => id !== module.id && ids.has(id));

/**
 * Kahn's algorithm over `requires`, taking the smallest id among the ready modules each round:
 * `ordered` has every module after the ones it requires, `stuck` those in or behind a cycle.
 */
function place(modules: ModuleFolder[]) {
	const ids = new Set(modules.map((module) => module.id));
	const waiting = modules.toSorted((a, b) => byName(a.id, b.id));
	const ordered: ModuleFolder[] = [];
	const done = new Set<string>();
	for (;;) {
		const ready = waiting.find(
			(module) => !done.has(module.id) && edges(module, ids).every((id) => done.has(id)),
		);
		if (!ready) break;
		ordered.push(ready);
		done.add(ready.id);
	}
	return { ordered, stuck: waiting.filter((module) => !done.has(module.id)), ids };
}

/**
 * The modules in dependency order: every module after the ones it requires, otherwise by id.
 * Modules in or behind a cycle come last, by id, so none is lost (`graphProblems()` reports it).
 */
export function byDependency(modules: ModuleFolder[]): ModuleFolder[] {
	const { ordered, stuck } = place(modules);
	return [...ordered, ...stuck];
}

/** What's wrong with the graph the modules' `requires` and `enhances` make, as sentences. */
export function graphProblems(modules: ModuleFolder[]): string[] {
	const problems: string[] = [];
	const { stuck, ids } = place(modules);
	for (const module of modules) {
		for (const key of ["requires", "enhances"] as const) {
			for (const id of module[key]) {
				if (id === module.id) problems.push(`src/modules/${module.id} ${key} itself.`);
				else if (!ids.has(id)) {
					problems.push(`src/modules/${module.id} ${key} ${id}, which isn't a module.`);
				}
			}
		}
	}

	for (const module of modules) {
		if (module.navAfter === module.id) problems.push(`src/modules/${module.id} nav.after itself.`);
	}

	if (stuck.length) {
		// Follow requires from the first module left over until an id repeats.
		const left = new Map(stuck.map((module) => [module.id, module]));
		const path: string[] = [];
		let next: string | undefined = stuck[0].id;
		while (next !== undefined && !path.includes(next)) {
			path.push(next);
			next = edges(left.get(next)!, ids).find((id) => left.has(id));
		}
		const cycle = [...path.slice(path.indexOf(next!)), next];
		problems.push(`src/modules: a requires cycle: ${cycle.join(" → ")}.`);
	}
	return problems;
}
