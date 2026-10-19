/**
 * The bug recorder: records the page with rrweb while the user runs into a problem, then sends the
 * recording with an optional note (`bug-report-button.svelte` is its button in both headers). One
 * per tab (`bugRecorder()`), outside any component, so a recording goes on across client-side
 * navigations, also from the office to the engineer portal. A reload ends it: what was recorded is
 * kept in `sessionStorage` (if it fits) and offered for sending once the page is back.
 *
 * Its phases and the steps between them are `machine.ts`'s.
 */
import { consoleEntries, type RecordedEvent, type RecordedRequest, requestTag } from "./events.ts";
import { next, type Phase, type Step } from "./machine.ts";
import {
	type ClientContext,
	maxRecordingMs,
	maxReportBytes,
	type ReportSummary,
	uploadPath,
} from "./report.ts";
import { trackRequests } from "./requests.ts";

/** A recording in progress: rrweb's, as `startRecording` started it. */
export interface Recording {
	stop(): void;
	/** Adds an event of our own to the recording, e.g. a request (`requests.ts`). */
	addCustomEvent(tag: string, payload: unknown): void;
}

/** What the recorder works with: the browser's, unless a test passes its own. */
export interface RecorderDeps {
	/** Starts recording the page, passing each event to `emit`. */
	startRecording(emit: (event: RecordedEvent) => void): Promise<Recording>;
	/** Notes the page's requests until the function it answers is called (`requests.ts`). */
	trackRequests(note: (request: RecordedRequest) => void): () => void;
	/** Posts a report's form, answering the server's response. */
	upload(body: FormData): Promise<Response>;
	/** Where a recording a reload interrupts is kept (`sessionStorage`), if anywhere. */
	storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
	/** Milliseconds since 1970. */
	now(): number;
	/** Calls `tick` every second until the function it answers is called. */
	everySecond(tick: () => void): () => void;
}

/** Why a report wasn't sent. */
export type SendFailure = "too-large" | "refused" | "network";

/** The result of `send()`. */
export type SendResult = { sent: true } | { sent: false; failure: SendFailure; message?: string };

/** The key of a recording kept over a reload. */
const storageKey = "bug-report:interrupted";

/** A recording kept over a reload. */
interface Interrupted {
	startedAt: number;
	durationMs: number;
	context: ClientContext;
	events: RecordedEvent[];
}

/**
 * Starts rrweb (loaded on the first recording: it's not in the app's bundle) with its console
 * plugin, for errors and warnings (it also catches the window's `error` and `unhandledrejection`
 * with them). Password fields are masked; elements marked `data-private` are left out.
 */
async function startRrweb(emit: (event: RecordedEvent) => void): Promise<Recording> {
	const [{ record }, { getRecordConsolePlugin }] = await Promise.all([
		import("@rrweb/record"),
		import("@rrweb/rrweb-plugin-console-record"),
	]);
	const stop = record({
		emit: (event) => emit(event as RecordedEvent),
		maskInputOptions: { password: true },
		blockSelector: "[data-private]",
		plugins: [getRecordConsolePlugin({ level: ["error", "warn"] })],
	});
	return {
		stop: () => stop?.(),
		addCustomEvent: (tag, payload) => record.addCustomEvent(tag, payload),
	};
}

/** Gzips `text` (`CompressionStream`). */
async function gzip(text: string) {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Response(stream).blob();
}

function browserDeps(): RecorderDeps {
	let storage: Storage | undefined;
	try {
		storage = window.sessionStorage;
	} catch {
		// Storage blocked: an interrupted recording is lost.
	}
	return {
		startRecording: startRrweb,
		trackRequests: (note) => trackRequests(note),
		upload: (body) =>
			// A redirect (to the login page, when the session has ended) is a failure, not an answer.
			fetch(uploadPath, { method: "POST", body, redirect: "error" }),
		storage,
		now: () => Date.now(),
		everySecond: (tick) => {
			const timer = setInterval(tick, 1000);
			return () => clearInterval(timer);
		},
	};
}

export class BugRecorder {
	phase: Phase = $state("idle");
	/** How long the recording has run (or ran), in milliseconds. */
	elapsed = $state(0);
	/** The note the user writes when the recording stops. */
	note = $state("");
	/** Whether the note's popover is open: it opens when the recording stops. */
	reviewing = $state(false);
	/** Whether the recording came back after a reload interrupted it. */
	interrupted = $state(false);

	#deps: RecorderDeps;
	#events: RecordedEvent[] = [];
	#context: ClientContext | undefined;
	#startedAt = 0;
	#recording: Recording | undefined;
	#stopTracking: (() => void) | undefined;
	#stopTicking: (() => void) | undefined;

	constructor(deps: RecorderDeps) {
		this.#deps = deps;
	}

	#step(step: Step) {
		const phase = next(this.phase, step);
		if (!phase) return false;
		this.phase = phase;
		return true;
	}

	/** Starts recording, with the page's context as it is now (`collectContext()`). */
	async start(context: ClientContext) {
		if (!this.#step("start")) return;
		this.#events = [];
		this.#context = context;
		this.#startedAt = this.#deps.now();
		this.elapsed = 0;
		this.note = "";
		this.interrupted = false;
		try {
			const recording = await this.#deps.startRecording((event) => this.#events.push(event));
			// Stopped while rrweb was loading.
			if (this.phase !== "recording") {
				recording.stop();
				return;
			}
			this.#recording = recording;
		} catch (error) {
			this.phase = "idle";
			throw error;
		}
		this.#stopTracking = this.#deps.trackRequests((request) =>
			this.#recording?.addCustomEvent(requestTag, request),
		);
		this.#stopTicking = this.#deps.everySecond(() => {
			this.elapsed = this.#deps.now() - this.#startedAt;
			if (this.elapsed >= maxRecordingMs) this.stop();
		});
	}

	/** Stops recording (a click, or the time limit), and asks for a note. */
	stop() {
		if (!this.#step("stop")) return;
		this.#end();
		this.elapsed = this.#deps.now() - this.#startedAt;
		this.reviewing = true;
	}

	#end() {
		this.#stopTicking?.();
		this.#stopTracking?.();
		this.#recording?.stop();
		this.#stopTicking = this.#stopTracking = this.#recording = undefined;
	}

	/** Leaves the recording without sending it. */
	discard() {
		if (!this.#step("discard")) return;
		this.#events = [];
		this.#context = undefined;
		this.reviewing = false;
		this.interrupted = false;
		this.note = "";
	}

	/** Sends the recording with the note, gzipped (at most `maxReportBytes`). */
	async send(): Promise<SendResult> {
		const context = this.#context;
		if (!context || !this.#step("send")) return { sent: false, failure: "refused" };
		const fail = (failure: SendFailure, message?: string): SendResult => {
			this.#step("failed");
			return { sent: false, failure, message };
		};
		const summary: ReportSummary = {
			note: this.note.trim(),
			startedAt: this.#startedAt,
			durationMs: Math.round(this.elapsed),
			context,
			errors: consoleEntries(this.#events)
				.slice(0, 50)
				.map(({ entry }) => `${entry.level}: ${entry.text}`.slice(0, 2000)),
		};
		const events = await gzip(JSON.stringify(this.#events));
		if (events.size > maxReportBytes) return fail("too-large");
		const body = new FormData();
		body.set("report", JSON.stringify(summary));
		body.set("events", events, "events.json.gz");
		let response: Response;
		try {
			response = await this.#deps.upload(body);
		} catch {
			return fail("network");
		}
		if (response.status === 413) return fail("too-large");
		if (!response.ok) return fail("refused", await messageOf(response));
		this.#step("sent");
		this.#events = [];
		this.#context = undefined;
		this.reviewing = false;
		this.interrupted = false;
		this.note = "";
		return { sent: true };
	}

	/** Keeps a recording in progress for after a reload (`pagehide`), if it fits. */
	keep() {
		if (this.phase !== "recording" || !this.#context || !this.#deps.storage) return;
		const interrupted: Interrupted = {
			startedAt: this.#startedAt,
			durationMs: this.#deps.now() - this.#startedAt,
			context: this.#context,
			events: this.#events,
		};
		try {
			this.#deps.storage.setItem(storageKey, JSON.stringify(interrupted));
		} catch {
			// Too large for the storage (a few MB): it's lost.
		}
	}

	/** Takes back a recording a reload interrupted, if there is one, and asks for a note. */
	restore() {
		const storage = this.#deps.storage;
		const kept = storage?.getItem(storageKey);
		if (!kept) return;
		storage!.removeItem(storageKey);
		let interrupted: Interrupted;
		try {
			interrupted = JSON.parse(kept) as Interrupted;
		} catch {
			return;
		}
		if (!this.#step("restore")) return;
		this.#startedAt = interrupted.startedAt;
		this.#context = interrupted.context;
		this.#events = interrupted.events;
		this.elapsed = interrupted.durationMs;
		this.note = "";
		this.interrupted = true;
		this.reviewing = true;
	}
}

/** The server's message for a refused report, if it said one. */
async function messageOf(response: Response) {
	try {
		const body = (await response.json()) as { message?: unknown };
		return typeof body.message === "string" ? body.message : undefined;
	} catch {
		return undefined;
	}
}

let recorder: BugRecorder | undefined;

/** The tab's recorder (in the browser only). */
export function bugRecorder() {
	recorder ??= new BugRecorder(browserDeps());
	return recorder;
}
