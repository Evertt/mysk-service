/**
 * Which modules are on, given the graph of what each requires (`moduleGraph`, from the modules'
 * `module.ts`). Pure and isomorphic. Every function takes the graph last so a spec can pass
 * `fakeGraph`; the graph is typed by strings and `ModuleNode`'s fields rather than `ModuleId`,
 * because a fake graph's ids aren't the real modules'. A graph lists its modules in dependency
 * order (each after the ones it requires), and every result keeps that order.
 */
import { type ModuleId, type ModuleNode, moduleGraph } from "./ids.ts";

/** A graph of modules by id; `moduleGraph` is one, and so is a fake. */
export type ModuleGraph = Readonly<
	Record<
		string,
		{ requires: readonly string[]; enhances: readonly string[]; alwaysOn: ModuleNode["alwaysOn"] }
	>
>;

/** The ids in `graph` that satisfy `keep`, in graph order. */
const inGraphOrder = (graph: ModuleGraph, keep: (id: string) => boolean) =>
	Object.keys(graph).filter(keep) as ModuleId[];

/**
 * The modules that are on for a tenant whose stored rows are `stored`: the ids the app doesn't
 * have are dropped, the always-on modules are added, and then every module whose `requires` aren't
 * all on is dropped, until nothing changes (a module's requirement dropping takes it along).
 * `enhances` plays no part: a module is on without the ones it only adds to.
 */
export function effectiveModules(
	stored: readonly string[],
	graph: ModuleGraph = moduleGraph,
): ModuleId[] {
	const on = new Set(inGraphOrder(graph, (id) => stored.includes(id) || graph[id].alwaysOn));
	let changed = true;
	while (changed) {
		changed = false;
		for (const id of on) {
			if (graph[id].requires.every((required) => on.has(required as ModuleId))) continue;
			on.delete(id);
			changed = true;
		}
	}
	return inGraphOrder(graph, (id) => on.has(id as ModuleId));
}

/** What `id` requires, and what those require in turn, in dependency order. */
export function requirementsOf(id: ModuleId, graph: ModuleGraph = moduleGraph): ModuleId[] {
	const found = new Set<string>();
	const visit = (from: string) => {
		for (const required of graph[from].requires) {
			if (found.has(required)) continue;
			found.add(required);
			visit(required);
		}
	};
	visit(id);
	return inGraphOrder(graph, (other) => found.has(other));
}

/** The modules that require `id`, directly or through others, in dependency order. */
export function dependentsOf(id: ModuleId, graph: ModuleGraph = moduleGraph): ModuleId[] {
	return inGraphOrder(graph, (other) => requirementsOf(other as ModuleId, graph).includes(id));
}
