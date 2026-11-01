/**
 * The modules as a map, for `<ModuleMap>`: which are on for a set of switches, as the app decides
 * it (`effectiveModules()`), and what requires or enhances what (`moduleGraph`, from each module's
 * `module.ts`).
 */
import { effectiveModules } from "#lib/modules/graph.ts";
import { type ModuleId, moduleGraph, moduleIds } from "#lib/modules/ids.ts";

import { arrowHead, type Point } from "../arrow.ts";

/** Whether a module is on: `dropped` is switched on, but a module it requires is off. */
export type ModuleState = "on" | "off" | "dropped";

/** Each module's state when the modules in `switchedOn` are switched on (the always-on ones are on). */
export function moduleStates(switchedOn: readonly ModuleId[]): Record<ModuleId, ModuleState> {
	const on = new Set(effectiveModules(switchedOn));
	return Object.fromEntries(
		moduleIds.map((id) => [id, on.has(id) ? "on" : switchedOn.includes(id) ? "dropped" : "off"]),
	) as Record<ModuleId, ModuleState>;
}

/** Every edge between modules: `from` requires `to`, or `from` enhances (adds to) `to`. */
export function moduleEdges(): { from: ModuleId; to: ModuleId; kind: "requires" | "enhances" }[] {
	return moduleIds.flatMap((from) =>
		(["requires", "enhances"] as const).flatMap((kind) =>
			moduleGraph[from][kind].map((to) => ({ from, to, kind })),
		),
	);
}

/** The drawing of what requires what, in its own units. */
export const requiresDrawing = { width: 340, nodeWidth: 152, nodeHeight: 36, rowGap: 78 } as const;

/**
 * Where each module that requires another, or is required, is drawn (its centre): in rows by how
 * deep its requirements go, the ones that need nothing at the top, spread across; each other one
 * under the middle of what it requires, so no line crosses a box.
 */
export function requiresLayout(): {
	positions: Map<ModuleId, { x: number; y: number }>;
	height: number;
} {
	const requires = moduleEdges().filter((edge) => edge.kind === "requires");
	const involved = moduleIds.filter((id) =>
		requires.some((edge) => edge.from === id || edge.to === id),
	);
	const depth = new Map<ModuleId, number>();
	// `moduleIds` lists every module after the ones it requires.
	for (const id of involved) {
		const below = moduleGraph[id].requires.map((required) => depth.get(required) ?? 0);
		depth.set(id, below.length ? Math.max(...below) + 1 : 0);
	}
	const { width, nodeWidth, nodeHeight, rowGap } = requiresDrawing;
	const top = involved.filter((id) => depth.get(id) === 0);
	const positions = new Map<ModuleId, { x: number; y: number }>();
	const y = (level: number) => nodeHeight / 2 + 8 + level * rowGap;
	const span = width - nodeWidth;
	top.forEach((id, index) =>
		positions.set(id, {
			x: nodeWidth / 2 + (top.length === 1 ? span / 2 : (span * index) / (top.length - 1)),
			y: y(0),
		}),
	);
	for (const id of involved.filter((other) => depth.get(other)! > 0)) {
		const xs = moduleGraph[id].requires.map((required) => positions.get(required)!.x);
		positions.set(id, { x: xs.reduce((sum, x) => sum + x, 0) / xs.length, y: y(depth.get(id)!) });
	}
	const levels = Math.max(0, ...depth.values());
	return { positions, height: y(levels) + nodeHeight / 2 + 8 };
}

/** The line from a module up to one it requires, ending in an arrow at the box it requires. */
export function requiresShape(from: Point, to: Point) {
	const half = requiresDrawing.nodeHeight / 2;
	const start = { x: from.x, y: from.y - half };
	const end = { x: to.x, y: to.y + half };
	return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, head: arrowHead(start, end) };
}
