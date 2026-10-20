import { toast } from "svelte-sonner";
import { SvelteSet } from "svelte/reactivity";

import { ran } from "#lib/components/form/submitted.ts";
import { getTimeZone } from "#lib/dates.ts";

import { getSchedule, moveOrder } from "../schedule.remote.ts";
import { applyMove, DEFAULT_TIME, formatDay, type RowId, type ScheduleOrder } from "./board.ts";

/**
 * Drag and drop on the board: the order being dragged and the cell it's over, and the move when it
 * drops. `week` (`yyyy-mm-dd`) and `names` (the engineers' names by id) are read when needed, so
 * they can follow the board's props; `settled` is called when the last move on its way is done.
 */
export function createBoardDrag(options: {
	week: () => string;
	names: () => Map<number, string>;
	settled?: () => void;
}) {
	let dragging = $state.raw<ScheduleOrder>();
	let target = $state<string>();
	const moving = new SvelteSet<number>();
	/** How many moves have started: a refresh that a move overlapped may answer from before it. */
	let started = 0;

	async function move(order: ScheduleOrder, engineerId: number | null, day: Temporal.PlainDate) {
		// Moves keep the time of day; orders from the backlog start at the default time.
		const timeZone = getTimeZone();
		const time =
			order.scheduledFor
				?.toZonedDateTimeISO(timeZone)
				.toPlainTime()
				.toString({ smallestUnit: "minute" }) ?? DEFAULT_TIME;
		const scheduledFor = day.toZonedDateTime({ timeZone, plainTime: time }).toInstant();
		if (order.engineerId === engineerId && order.scheduledFor?.equals(scheduledFor)) return;

		moving.add(order.id);
		started++;
		const moved = await ran(
			moveOrder({ id: order.id, engineerId, day: day.toString(), time }).updates(
				getSchedule(options.week()).withOverride((current) =>
					applyMove(current, { id: order.id, engineerId, scheduledFor }),
				),
			),
			m.schedule_move_failed({ number: order.number }),
		);
		if (moved) {
			const who = (engineerId && options.names().get(engineerId)) || m.schedule_nobody();
			toast.success(m.schedule_moved({ number: order.number, who, day: formatDay(day), time }));
		}
		moving.delete(order.id);
		if (!moving.size) options.settled?.();
	}

	return {
		/** The cell (see `cellKey`) a dragged order is over. */
		get target() {
			return target;
		},
		/** Whether a move of `order` is on its way to the server. */
		isMoving: (order: ScheduleOrder) => moving.has(order.id),
		/** Whether any move is on its way to the server. */
		get busy() {
			return moving.size > 0;
		},
		/** How many moves have started so far. */
		get started() {
			return started;
		},

		start(event: DragEvent, order: ScheduleOrder) {
			event.dataTransfer?.setData("text/plain", order.number);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			dragging = order;
		},
		end() {
			dragging = target = undefined;
		},
		over(event: DragEvent, key: string) {
			if (!dragging) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			target = key;
		},
		leave(event: DragEvent, key: string) {
			const cell = event.currentTarget as HTMLElement;
			if (target === key && !cell.contains(event.relatedTarget as Node | null)) target = undefined;
		},
		/** Moves the dragged order to the engineer of `row` (or nobody) on `day`. */
		async drop(event: DragEvent, row: RowId, day: Temporal.PlainDate) {
			event.preventDefault();
			const order = dragging;
			dragging = target = undefined;
			if (order) await move(order, row === "unassigned" ? null : row, day);
		},
	};
}
