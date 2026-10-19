/**
 * When a record's link (`RecordLink`) shows a hover card of the record: in the office shell only,
 * which turns them on (`showRecordPreviews()` in the `(app)` layout), never inside a card (no card
 * in a card), and with a pointer that hovers (`RecordLink` asks `finePointer` live).
 *
 * A card opens after the pointer rested on the link for `openDelay` (half a second: crossing the
 * page opens none, resting on a link is a sign of intent), and closes `closeDelay` after it left.
 * The end-to-end tests open cards without the wait: they set `previewDelayKey` in the tab's
 * `sessionStorage` to the delay they want, in milliseconds, which the links read once. That's all
 * the key does.
 */
import { getContext, setContext } from "svelte";
import { MediaQuery } from "svelte/reactivity";

import { previewDelayKey } from "./preview-delay.ts";

const contextKey = Symbol("record previews");

/** Turns record links' hover cards on for the component's children (the office shell). */
export function showRecordPreviews() {
	setContext(contextKey, true);
}

/** Turns them off for the component's children: a card's content, which a card isn't nested in. */
export function hideRecordPreviews() {
	setContext(contextKey, false);
}

/** Whether a record link in this component shows a hover card. */
export function recordPreviewsShown(): boolean {
	return getContext<boolean | undefined>(contextKey) ?? false;
}

/** Whether the device's pointer hovers and points finely: a mouse or trackpad, not a finger. */
export const finePointer = new MediaQuery("(hover: hover) and (pointer: fine)", false);

/** How long the pointer rests on a link before its card opens. */
const standardOpenDelay = 500;

/** How long a card stays after the pointer left it (or its link). */
export const closeDelay = 150;

/**
 * How long the pointer rests on a link before the link asks for its record: before SvelteKit's
 * preload of the link's page does (20 ms after the pointer stopped), so the two share the request
 * (see `RecordLink`).
 */
export const restDelay = 10;

let openDelayRead: number | undefined;

/** The open delay: `standardOpenDelay`, unless `previewDelayKey` says otherwise. Read once. */
export function openDelay(): number {
	if (openDelayRead !== undefined) return openDelayRead;
	let stored: string | null = null;
	try {
		stored = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(previewDelayKey);
	} catch {
		// Storage that can't be read (blocked cookies): the standard delay.
	}
	const set = stored === null || stored.trim() === "" ? Number.NaN : Number(stored);
	openDelayRead = Number.isFinite(set) && set >= 0 ? set : standardOpenDelay;
	return openDelayRead;
}
