/**
 * The recorder's states and the steps between them (`recorder.svelte.ts` follows them):
 *
 * - `idle`: nothing recorded; `start` begins.
 * - `recording`: rrweb records; `stop` (a click, or the time limit) ends it.
 * - `stopping`: the recording waits for a note, to be sent or discarded. A recording a reload
 *   interrupted comes back here (`restore`).
 * - `sending`: being uploaded; `sent` goes back to `idle`, `failed` back to `stopping`, so it can be
 *   sent again.
 */
export type Phase = "idle" | "recording" | "stopping" | "sending";

export type Step = "start" | "stop" | "restore" | "send" | "sent" | "failed" | "discard";

const steps: Record<Phase, Partial<Record<Step, Phase>>> = {
	idle: { start: "recording", restore: "stopping" },
	recording: { stop: "stopping" },
	stopping: { send: "sending", discard: "idle" },
	sending: { sent: "idle", failed: "stopping" },
};

/** The phase `step` leads to from `phase`, or `undefined` if it can't be taken from there. */
export const next = (phase: Phase, step: Step): Phase | undefined => steps[phase][step];
