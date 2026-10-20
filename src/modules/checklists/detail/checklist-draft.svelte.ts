/**
 * A draft checklist as it's filled in, in the engineer portal and on the office's work orders page
 * alike: the answers kept here as they're given (shown at once, whatever the server's copy says by
 * then), each saved as it's given, one after another so the last answer given stays; a remark a
 * moment after typing stops, or when its field is left; and completing once every point is
 * answered, after what's still to save, unless some of it fails to. An answer that fails to save
 * is taken back to the server's, and said so, unless a newer one has replaced it by then.
 */
import { untrack } from "svelte";

import { ran } from "#lib/components/form/submitted.ts";

import { canComplete, completionProblems, type PointResult, progress } from "../model.ts";

/** A point of a draft, as the server has it. */
interface DraftPoint {
	id: number;
	group: string;
	text: string;
	result: PointResult | null;
	remark: string | null;
}

/** Who saves the draft's changes: the portal's commands, or the office's. */
interface DraftSaves {
	answer: (input: { id: number; result: PointResult | null }) => Promise<unknown>;
	remarkOn: (input: { id: number; remark: string }) => Promise<unknown>;
	remarkForCustomer: (input: { id: number; remarks: string }) => Promise<unknown>;
	complete: (input: { id: number }) => Promise<unknown>;
}

/**
 * The draft of `checklist` (its points and general remark as loaded), saved through `saves`. Call
 * it while the component initializes.
 */
export function checklistDraft<Point extends DraftPoint>(
	checklist: () => { id: number; remarks: string | null; results: readonly Point[] },
	saves: DraftSaves,
) {
	const points = $state(untrack(() => checklist().results.map((point) => ({ ...point }))));
	let remarks = $state(untrack(() => checklist().remarks ?? ""));
	let saving = $state(0);
	let completing = $state(false);
	/** Whether completing was tried, to show what's missing. */
	let tried = $state(false);

	const counts = $derived(progress(points));
	const ready = $derived(canComplete(points));
	const problems = $derived(completionProblems(points));

	/** Saves run one after another, so the last answer given is the one that stays. */
	let queue: Promise<unknown> = Promise.resolve();
	/** How many saves have failed, so completing knows whether one did while it waited. */
	let failures = 0;
	function enqueue(save: () => Promise<unknown>, undo: () => void) {
		saving++;
		queue = queue.then(async () => {
			if (!(await ran(save, m.checklists_save_failed()))) {
				failures++;
				undo();
			}
			saving--;
		});
	}
	/** Waits until every save is done, also those given while it waits. */
	async function settled() {
		let last;
		do {
			last = queue;
			await last;
		} while (last !== queue);
	}

	// Plain records: what's pending to save shows nowhere.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	/** Saves a moment after typing stops. */
	function later(key: string, save: () => void) {
		clearTimeout(timers[key]);
		timers[key] = setTimeout(() => {
			delete timers[key];
			save();
		}, 800);
	}
	/** Saves now what's waiting to be saved, if anything. */
	function now(key: string, save: () => void) {
		if (!(key in timers)) return;
		clearTimeout(timers[key]);
		delete timers[key];
		save();
	}

	/** What the server has of each point's result, as its saves confirm it. */
	const answered: Record<number, PointResult | null> = Object.fromEntries(
		untrack(() => checklist().results.map((point) => [point.id, point.result])),
	);

	/**
	 * What's sent of each point's remark, to save only a change; `null` once a save failed, as the
	 * server's is then unknown.
	 */
	const saved: Record<number, string | null> = Object.fromEntries(
		untrack(() => checklist().results.map((point) => [point.id, point.remark ?? ""])),
	);
	function saveRemark(point: Point) {
		const remark = point.remark ?? "";
		if (remark === saved[point.id]) return;
		saved[point.id] = remark;
		// A remark that fails to save stays as typed, and is saved again when it's changed or the
		// checklist completed (unless a newer one is on its way by then).
		enqueue(
			() => saves.remarkOn({ id: point.id, remark }),
			() => {
				if (saved[point.id] === remark) saved[point.id] = null;
			},
		);
	}

	let savedRemarks: string | null = untrack(() => checklist().remarks ?? "");
	function saveRemarks() {
		if (remarks === savedRemarks) return;
		const sent = (savedRemarks = remarks);
		enqueue(
			() => saves.remarkForCustomer({ id: untrack(checklist).id, remarks: sent }),
			() => {
				if (savedRemarks === sent) savedRemarks = null;
			},
		);
	}

	return {
		points,
		get remarks() {
			return remarks;
		},
		/** Sets the general remark, saved a moment after typing stops. */
		set remarks(value: string) {
			remarks = value;
			later("remarks", saveRemarks);
		},
		/** How many changes are being saved. */
		get saving() {
			return saving;
		},
		get completing() {
			return completing;
		},
		get tried() {
			return tried;
		},
		get counts() {
			return counts;
		},
		get problems() {
			return problems;
		},
		/** Gives a point a result, saved at once. */
		setResult(point: Point, result: PointResult) {
			if (point.result === result) return;
			point.result = result;
			enqueue(
				async () => {
					await saves.answer({ id: point.id, result });
					answered[point.id] = result;
				},
				// Back to the server's, unless a newer answer replaced it since.
				() => {
					if (point.result === result) point.result = answered[point.id] ?? null;
				},
			);
		},
		/** Sets a point's remark, saved a moment after typing stops. */
		setRemark(point: Point, remark: string) {
			point.remark = remark;
			later(`point-${point.id}`, () => saveRemark(point));
		},
		/** Saves a point's remark now, if it's waiting (its field is left). */
		flushRemark(point: Point) {
			now(`point-${point.id}`, () => saveRemark(point));
		},
		/** Saves the general remark now, if it's waiting. */
		flushRemarks() {
			now("remarks", saveRemarks);
		},
		/**
		 * Completes it, once every point is answered (else it shows what's missing), after what's
		 * still to save (and remarks whose save failed); not if some of it fails to save, which is
		 * taken back and said so. Answers whether it did.
		 */
		async complete() {
			tried = true;
			if (!ready) return false;
			for (const key of Object.keys(timers)) {
				clearTimeout(timers[key]);
				delete timers[key];
			}
			const failed = failures;
			for (const point of points) saveRemark(point);
			saveRemarks();
			completing = true;
			await settled();
			// Not if the server hasn't all that's shown, or an answer was taken back.
			const done =
				failures === failed &&
				ready &&
				(await ran(saves.complete({ id: untrack(checklist).id }), m.checklists_save_failed()));
			completing = false;
			return done;
		},
	};
}
