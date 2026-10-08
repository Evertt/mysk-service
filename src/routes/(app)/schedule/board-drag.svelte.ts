import { toast } from "svelte-sonner";
import { SvelteSet } from "svelte/reactivity";

import { atTime, timeOfDay } from "#lib/dates.ts";
import { m } from "#lib/paraglide/messages.js";
import { errorMessage } from "#lib/utils.ts";

import {
	applyMove,
	DEFAULT_TIME,
	dayKey,
	formatDay,
	type RowId,
	type ScheduleOrder,
} from "./board.ts";
import { getSchedule, moveOrder } from "./schedule.remote.ts";

/**
 * Drag and drop on the board: the order being dragged and the cell it's over, and the move when it
 * drops. `week` (`yyyy-mm-dd`) and `names` (the engineers' names by id) are read when needed, so
 * they can follow the board's props.
 */
export function createBoardDrag(options: { week: () => string; names: () => Map<number, string> }) {
	let dragging = $state.raw<ScheduleOrder>();
	let target = $state<string>();
	const moving = new SvelteSet<number>();

	async function move(order: ScheduleOrder, engineerId: number | null, day: Date) {
		// Moves keep the time of day; orders from the backlog start at the default time.
		const time = order.scheduledFor ? timeOfDay(order.scheduledFor) : DEFAULT_TIME;
		const scheduledFor = atTime(day, time);
		if (order.engineerId === engineerId && order.scheduledFor?.getTime() === scheduledFor.getTime())
			return;

		moving.add(order.id);
		try {
			await moveOrder({ id: order.id, engineerId, day: dayKey(day), time }).updates(
				getSchedule(options.week()).withOverride((current) =>
					applyMove(current, { id: order.id, engineerId, scheduledFor }),
				),
			);
			const who = (engineerId && options.names().get(engineerId)) || m.schedule_nobody();
			toast.success(m.schedule_moved({ number: order.number, who, day: formatDay(day), time }));
		} catch (error) {
			toast.error(errorMessage(error, m.schedule_move_failed({ number: order.number })));
		} finally {
			moving.delete(order.id);
		}
	}

	return {
		/** The cell (see `cellKey`) a dragged order is over. */
		get target() {
			return target;
		},
		/** Whether a move of `order` is on its way to the server. */
		isMoving: (order: ScheduleOrder) => moving.has(order.id),

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
		async drop(event: DragEvent, row: RowId, day: Date) {
			event.preventDefault();
			const order = dragging;
			dragging = target = undefined;
			if (order) await move(order, row === "unassigned" ? null : row, day);
		},
	};
}
