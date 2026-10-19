import { gunzipSync } from "node:zlib";

import * as v from "valibot";
import { expect, test, vi } from "vite-plus/test";

import type { RecordedEvent, RecordedRequest } from "#lib/bug-reports/events.ts";
import { BugRecorder, type RecorderDeps } from "#lib/bug-reports/recorder.svelte.ts";
import type { ClientContext } from "#lib/bug-reports/report.ts";
import { maxRecordingMs, reportSummarySchema } from "#lib/bug-reports/report.ts";

const context: ClientContext = {
	url: "http://localhost/orders",
	routeId: "/(app)/orders",
	version: "1",
	viewport: { width: 1280, height: 800, pixelRatio: 1 },
	userAgent: "Test/1.0",
	locale: "en",
	languages: ["en"],
	timeZone: "Europe/Amsterdam",
	theme: "lagoon",
	mode: "light",
	dark: false,
	density: "comfortable",
	online: true,
};

/** A recorder with fake parts: a clock to move, a tick to run, rrweb and requests to fake. */
function setup(
	upload: RecorderDeps["upload"] = async () => Response.json({ id: "x" }, { status: 201 }),
) {
	let time = 1_000_000;
	let tick = () => {};
	let emit: (event: RecordedEvent) => void = () => {};
	let noteRequest: (request: RecordedRequest) => void = () => {};
	const kept = new Map<string, string>();
	const stopRecording = vi.fn();
	const stopTracking = vi.fn();
	const uploads = vi.fn(upload);
	const deps: RecorderDeps = {
		startRecording: async (emitEvent) => {
			emit = emitEvent;
			emit({ type: 4, timestamp: time, data: {} });
			return {
				stop: stopRecording,
				addCustomEvent: (tag, payload) =>
					emit({ type: 5, timestamp: time, data: { tag, payload } }),
			};
		},
		trackRequests: (note) => {
			noteRequest = note;
			return stopTracking;
		},
		upload: uploads,
		storage: {
			getItem: (key) => kept.get(key) ?? null,
			setItem: (key, value) => void kept.set(key, value),
			removeItem: (key) => void kept.delete(key),
		},
		now: () => time,
		everySecond: (run) => {
			tick = run;
			return () => (tick = () => {});
		},
	};
	return {
		uploads,
		kept,
		stopRecording,
		stopTracking,
		recorder: new BugRecorder(deps),
		wait: (ms: number) => {
			time += ms;
			tick();
		},
		emit: (event: Omit<RecordedEvent, "timestamp">) => emit({ ...event, timestamp: time }),
		request: (request: RecordedRequest) => noteRequest(request),
	};
}

/** What `upload` was sent: the summary, and the events unpacked. */
async function sent(uploads: ReturnType<typeof setup>["uploads"]) {
	const body = uploads.mock.calls[0][0];
	const events = body.get("events") as File;
	return {
		summary: v.parse(reportSummarySchema, JSON.parse(body.get("report") as string)),
		events: JSON.parse(
			gunzipSync(Buffer.from(await events.arrayBuffer())).toString(),
		) as RecordedEvent[],
	};
}

test("records, stops for a note, and sends the recording with it", async () => {
	const { recorder, uploads, wait, emit, request, stopRecording, stopTracking } = setup();
	await recorder.start(context);
	expect(recorder.phase).toBe("recording");

	wait(3000);
	expect(recorder.elapsed).toBe(3000);
	emit({
		type: 6,
		data: {
			plugin: "rrweb/console@1",
			payload: { level: "error", trace: [], payload: ['"Boom"'] },
		},
	});
	request({
		kind: "remote",
		name: "getOrders",
		method: "GET",
		status: 200,
		durationMs: 12,
		size: 3,
	});

	wait(2000);
	recorder.stop();
	expect(recorder.phase).toBe("stopping");
	expect(recorder.reviewing).toBe(true);
	expect(stopRecording).toHaveBeenCalled();
	expect(stopTracking).toHaveBeenCalled();

	recorder.note = "  The list stayed empty\nafter saving  ";
	expect(await recorder.send()).toEqual({ sent: true });
	expect(recorder.phase).toBe("idle");
	expect(recorder.reviewing).toBe(false);

	const { summary, events } = await sent(uploads);
	expect(summary).toMatchObject({
		note: "The list stayed empty\nafter saving",
		startedAt: 1_000_000,
		durationMs: 5000,
		context,
		errors: ["error: Boom"],
	});
	expect(events.map((event) => event.type)).toEqual([4, 6, 5]);
	expect(events[2].data).toMatchObject({ tag: "request", payload: { name: "getOrders" } });
});

test("stops by itself at the time limit", async () => {
	const { recorder, wait } = setup();
	await recorder.start(context);
	wait(maxRecordingMs - 1000);
	expect(recorder.phase).toBe("recording");
	wait(1000);
	expect(recorder.phase).toBe("stopping");
	expect(recorder.reviewing).toBe(true);
});

test("discards a recording without sending it", async () => {
	const { recorder, uploads } = setup();
	await recorder.start(context);
	recorder.stop();
	recorder.discard();
	expect(recorder.phase).toBe("idle");
	expect(uploads).not.toHaveBeenCalled();
});

test("keeps the recording to send again when the server refuses it", async () => {
	const { recorder } = setup(async () =>
		Response.json({ message: "Not signed in" }, { status: 401 }),
	);
	await recorder.start(context);
	recorder.stop();
	recorder.note = "Again";
	expect(await recorder.send()).toEqual({
		sent: false,
		failure: "refused",
		message: "Not signed in",
	});
	expect(recorder.phase).toBe("stopping");
	expect(recorder.note).toBe("Again");
});

test("says when the server finds it too large, or the network failed", async () => {
	const large = setup(async () => Response.json({ message: "Too large" }, { status: 413 }));
	await large.recorder.start(context);
	large.recorder.stop();
	expect(await large.recorder.send()).toEqual({ sent: false, failure: "too-large" });

	const offline = setup(() => Promise.reject(new TypeError("Failed to fetch")));
	await offline.recorder.start(context);
	offline.recorder.stop();
	expect(await offline.recorder.send()).toEqual({ sent: false, failure: "network" });
	expect(offline.recorder.phase).toBe("stopping");
});

test("keeps a recording over a reload and offers it for sending afterwards", async () => {
	const before = setup();
	await before.recorder.start(context);
	before.wait(4000);
	before.recorder.keep();

	// The reloaded page: a new recorder, with the same storage.
	const after = setup();
	for (const [key, value] of before.kept) after.kept.set(key, value);
	after.recorder.restore();
	expect(after.recorder.phase).toBe("stopping");
	expect(after.recorder.interrupted).toBe(true);
	expect(after.recorder.reviewing).toBe(true);
	expect(after.recorder.elapsed).toBe(4000);
	expect(after.kept.size).toBe(0);

	expect(await after.recorder.send()).toEqual({ sent: true });
	const { summary, events } = await sent(after.uploads);
	expect(summary).toMatchObject({ startedAt: 1_000_000, durationMs: 4000, context });
	expect(events).toHaveLength(1);
});

test("keeps nothing when it isn't recording, and restores nothing when nothing was kept", async () => {
	const { recorder, kept } = setup();
	recorder.keep();
	expect(kept.size).toBe(0);
	recorder.restore();
	expect(recorder.phase).toBe("idle");
});
