import { expect, test } from "vite-plus/test";

import { next, type Phase, type Step } from "#lib/bug-reports/machine.ts";

test("goes from idle to recording, to a note, and is sent or discarded", () => {
	expect(next("idle", "start")).toBe("recording");
	expect(next("recording", "stop")).toBe("stopping");
	expect(next("stopping", "send")).toBe("sending");
	expect(next("sending", "sent")).toBe("idle");
	expect(next("stopping", "discard")).toBe("idle");
});

test("goes back to the note when sending fails, so it can be sent again", () => {
	expect(next("sending", "failed")).toBe("stopping");
});

test("takes a recording a reload interrupted only when idle", () => {
	expect(next("idle", "restore")).toBe("stopping");
	expect(next("recording", "restore")).toBeUndefined();
	expect(next("stopping", "restore")).toBeUndefined();
});

test("refuses every other step", () => {
	const allowed: Record<Phase, Step[]> = {
		idle: ["start", "restore"],
		recording: ["stop"],
		stopping: ["send", "discard"],
		sending: ["sent", "failed"],
	};
	const steps: Step[] = ["start", "stop", "restore", "send", "sent", "failed", "discard"];
	for (const [phase, own] of Object.entries(allowed) as [Phase, Step[]][]) {
		for (const step of steps.filter((step) => !own.includes(step))) {
			expect(next(phase, step), `${step} from ${phase}`).toBeUndefined();
		}
	}
});
