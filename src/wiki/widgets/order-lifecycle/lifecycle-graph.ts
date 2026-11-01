/**
 * The order lifecycle as a graph, for `<OrderLifecycle>`: every move `orderTransitions` allows, as
 * an edge from a status to another, and where each status is drawn. Read from the table itself, so
 * the wiki can't drift from the app.
 */
import { type OrderStatus, orderStatuses } from "#lib/models.ts";
import {
	type OrderActor,
	type OrderVerb,
	orderTransitions,
	type TransitionRule,
} from "#lib/orders/index.ts";
import { m } from "#lib/paraglide/messages.js";

import { arrowHead, type Point, round } from "../arrow.ts";

/** One move of an order: `verb` takes it `from` a status `to` another, made `by` an actor. */
export interface LifecycleEdge {
	from: OrderStatus;
	to: OrderStatus;
	verb: OrderVerb;
	by: OrderActor;
}

type Transitions = typeof orderTransitions;

/**
 * Every edge of `orderTransitions`, self-loops dropped; a function `to` (plan's) is applied to
 * each `from` with `engineerId` null and 1, its distinct outcomes kept.
 */
export function lifecycleEdges(transitions: Transitions = orderTransitions): LifecycleEdge[] {
	return Object.entries(transitions).flatMap(([verb, rule]) =>
		rule.from.flatMap((from: OrderStatus) => {
			const to: TransitionRule["to"] = rule.to;
			const targets =
				typeof to === "function" ? new Set([null, 1].map((engineer) => to(from, engineer))) : to;
			return [...targets]
				.filter((target) => target !== from)
				.map((target) => ({ from, to: target, verb: verb as OrderVerb, by: rule.by }));
		}),
	);
}

/** The edges that leave `status` (`out`) and that arrive at it (`in`). */
export function edgesOf(status: OrderStatus, edges: LifecycleEdge[] = lifecycleEdges()) {
	return {
		out: edges.filter((edge) => edge.from === status),
		in: edges.filter((edge) => edge.to === status),
	};
}

/** Who makes a move, as the wiki says it: message functions, read where they are shown. */
export const actorLabels: Record<OrderActor, () => string> = {
	office: m.wiki_actor_office,
	planner: m.wiki_actor_planner,
	acceptance: m.wiki_actor_acceptance,
	engineer: m.wiki_actor_engineer,
	invoicing: m.wiki_actor_invoicing,
};

/**
 * The drawing's size, in its own units. Narrow and tall, so its text stays legible on a phone: the
 * lifecycle runs down a column, and cancelled stands beside it.
 */
export const lifecycleDrawing = { width: 360, height: 420, nodeHeight: 40 } as const;

const column = { x: 150, width: 150 };
const aside = { x: 312, width: 88 };
const row = (index: number) => 28 + index * 72;

/**
 * Where each status is drawn (its centre): the lifecycle's steps one below the other in their
 * order (awaiting_acceptance, quote, scheduled, in_progress, completed, invoiced), cancelled beside
 * them, level with the open work it ends.
 */
export const statusLayout: Record<OrderStatus, { x: number; y: number }> = {
	awaiting_acceptance: { x: column.x, y: row(0) },
	quote: { x: column.x, y: row(1) },
	scheduled: { x: column.x, y: row(2) },
	in_progress: { x: column.x, y: row(3) },
	completed: { x: column.x, y: row(4) },
	invoiced: { x: column.x, y: row(5) },
	cancelled: { x: aside.x, y: (row(2) + row(3)) / 2 },
};

/** How wide a status is drawn. */
export const nodeWidth = (status: OrderStatus) =>
	status === "cancelled" ? aside.width : column.width;

/** The statuses down the column, in the lifecycle's order. */
const inColumn = (status: OrderStatus) => status !== "cancelled";
const rowOf = (status: OrderStatus) => orderStatuses.indexOf(status);

/** How an edge is drawn: its path, its arrowhead, and where its label goes (the office's have none). */
export interface EdgeShape {
	path: string;
	head: string;
	label?: Point & { anchor: "start" | "end" };
}

/**
 * Where `edge` is drawn among `edges`. The lifecycle's own moves run straight down the column
 * (side by side where they go both ways), the office's by hand bend round its left, and the moves
 * to and from cancelled cross over to it.
 */
export function edgeShape(edge: LifecycleEdge, edges: LifecycleEdge[]): EdgeShape {
	const [from, to] = [statusLayout[edge.from], statusLayout[edge.to]];
	const half = lifecycleDrawing.nodeHeight / 2;
	const down = to.y > from.y;
	const step = rowOf(edge.to) - rowOf(edge.from);

	if (!inColumn(edge.from) || !inColumn(edge.to)) {
		const toAside = inColumn(edge.from);
		const main = toAside ? edge.from : edge.to;
		const spread = (rowOf(main) - 2.5) * 6 + (toAside ? -2 : 2);
		const start = toAside
			? { x: column.x + column.width / 2, y: from.y - 5 }
			: { x: aside.x - aside.width / 2, y: from.y + spread };
		const end = toAside
			? { x: aside.x - aside.width / 2, y: to.y + spread }
			: { x: column.x + column.width / 2, y: to.y + 5 };
		const middle = (start.x + end.x) / 2;
		return {
			path: `M ${start.x} ${round(start.y)} C ${middle} ${round(start.y)}, ${middle} ${round(end.y)}, ${end.x} ${round(end.y)}`,
			head: arrowHead({ x: middle, y: end.y }, end),
			...(edge.by === "office"
				? {}
				: { label: { x: middle + 8, y: round((start.y + end.y) / 2), anchor: "start" as const } }),
		};
	}

	if (edge.by !== "office" && Math.abs(step) === 1) {
		const back = edges.some(
			(other) => other.by !== "office" && other.from === edge.to && other.to === edge.from,
		);
		const x = column.x + (back ? (down ? -14 : 14) : 0);
		const start = { x, y: from.y + (down ? half : -half) };
		const end = { x, y: to.y + (down ? -half : half) };
		const leftOfLine = back && down;
		return {
			path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
			head: arrowHead(start, end),
			label: {
				x: x + (leftOfLine ? -8 : 8),
				y: (start.y + end.y) / 2,
				anchor: leftOfLine ? "end" : "start",
			},
		};
	}

	const left = column.x - column.width / 2;
	const bulge = 16 + 12 * Math.abs(step) + (down ? 0 : 7);
	const start = { x: left, y: from.y + (down ? 8 : -8) };
	const end = { x: left, y: to.y + (down ? -8 : 8) };
	return {
		path: `M ${start.x} ${start.y} C ${left - bulge} ${start.y}, ${left - bulge} ${end.y}, ${end.x} ${end.y}`,
		head: arrowHead({ x: left - bulge, y: end.y }, end),
	};
}
