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

/**
 * The stored modules whose direct `requires` aren't all stored or always on, each with the ones
 * missing, in graph order: what a set of rows must not contain. Ids the graph doesn't have are
 * ignored.
 */
export function moduleSetProblems(
	stored: readonly string[],
	graph: ModuleGraph = moduleGraph,
): { module: ModuleId; missing: ModuleId[] }[] {
	return inGraphOrder(graph, (id) => stored.includes(id)).flatMap((module) => {
		const missing = graph[module].requires.filter(
			(required) => !stored.includes(required) && !graph[required].alwaysOn,
		) as ModuleId[];
		return missing.length ? [{ module, missing }] : [];
	});
}

/** Why `changeModules()` refuses a change: the modules at fault, in graph order. */
interface RefusedChange {
	/** Always-on modules the change would switch off. */
	alwaysOn: ModuleId[];
	/** Modules the change would leave without something they require. */
	unmet: ModuleId[];
}

/**
 * The stored modules after switching `enable` on and `disable` off (a module in both ends up off),
 * or why that's refused: it would switch off an always-on module, or leave a module without
 * something it requires. Always-on modules are never stored (they're on anyway).
 *
 * Only what the change breaks is refused: a stored module that already missed a requirement (a
 * stale row, e.g. after a hand edit; it's off, see `effectiveModules()`) doesn't block a change to
 * other modules, and stays stored until it's switched on with what it requires, or off.
 */
export function changeModules(
	stored: readonly string[],
	change: { enable: readonly string[]; disable: readonly string[] },
	graph: ModuleGraph = moduleGraph,
): { stored: ModuleId[] } | { refused: RefusedChange } {
	const next = inGraphOrder(
		graph,
		(id) =>
			!graph[id].alwaysOn &&
			(stored.includes(id) || change.enable.includes(id)) &&
			!change.disable.includes(id),
	);
	const missingBefore = new Map(
		moduleSetProblems(stored, graph).map(({ module, missing }) => [module, missing]),
	);
	const unmet = new Set(
		moduleSetProblems(next, graph)
			.filter(({ module, missing }) =>
				missing.some((id) => !(missingBefore.get(module) ?? []).includes(id)),
			)
			.map(({ module }) => module),
	);
	const alwaysOn = new Set(change.disable.filter((id) => graph[id]?.alwaysOn));
	return unmet.size || alwaysOn.size
		? {
				refused: {
					alwaysOn: inGraphOrder(graph, (id) => alwaysOn.has(id)),
					unmet: inGraphOrder(graph, (id) => unmet.has(id as ModuleId)),
				},
			}
		: { stored: next };
}
