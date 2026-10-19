/**
 * Reading a recording's events: what the console said and which requests the page made, with
 * their moments, for the mail's summary (`recorder.svelte.ts`) and the replay page's lists. rrweb
 * keeps both in its event stream: the console as its console plugin's events, the requests as our
 * own custom events (`requests.ts`), so a moment in either is a moment in the replay.
 */

/** An rrweb event, as far as this reads it (rrweb's `eventWithTime`). */
export interface RecordedEvent {
	type: number;
	timestamp: number;
	data: unknown;
}

/** rrweb's event types (`EventType` of `@rrweb/types`) that this reads. */
const eventType = { custom: 5, plugin: 6 } as const;

/** The name of rrweb's console plugin, in its events (`PLUGIN_NAME`). */
export const consolePlugin = "rrweb/console@1";

/** The tag of our custom event for a request (`record.addCustomEvent`). */
export const requestTag = "request";

/** A request the page made while it was recorded: a remote function's call or a page's data. */
export interface RecordedRequest {
	/** A remote function call (`/_app/remote/…`) or a page's server data (`…/__data.json`). */
	kind: "remote" | "data";
	/** The remote function's name, or the page's path. */
	name: string;
	method: string;
	/** The response's status; `null` when there was none (the network failed, or it was aborted). */
	status: number | null;
	durationMs: number;
	/** The response's size as its `Content-Length` says, if it says. */
	size: number | null;
}

/** A console message: an error or a warning, or an error nothing caught. */
export interface ConsoleEntry {
	level: string;
	text: string;
	trace: string[];
}

/** Something that happened at a moment of the recording, `offset` milliseconds after its start. */
export interface Moment<T> {
	offset: number;
	entry: T;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/** The console's messages in `events`, with their moments. */
export function consoleEntries(events: readonly RecordedEvent[]): Moment<ConsoleEntry>[] {
	const start = events[0]?.timestamp ?? 0;
	return events.flatMap((event) => {
		if (event.type !== eventType.plugin || !isObject(event.data)) return [];
		const { plugin, payload } = event.data;
		if (plugin !== consolePlugin || !isObject(payload)) return [];
		const parts = Array.isArray(payload.payload) ? payload.payload.map(String) : [];
		const entry: ConsoleEntry = {
			level: String(payload.level),
			// The plugin keeps each argument as JSON: a string comes quoted.
			text: parts.map(unquote).join(" "),
			trace: Array.isArray(payload.trace) ? payload.trace.map(String) : [],
		};
		return [{ offset: event.timestamp - start, entry }];
	});
}

/** The requests in `events`, with their moments (when each was answered). */
export function requestEntries(events: readonly RecordedEvent[]): Moment<RecordedRequest>[] {
	const start = events[0]?.timestamp ?? 0;
	return events.flatMap((event) => {
		if (event.type !== eventType.custom || !isObject(event.data)) return [];
		if (event.data.tag !== requestTag || !isObject(event.data.payload)) return [];
		const entry = event.data.payload as unknown as RecordedRequest;
		return [{ offset: event.timestamp - start, entry }];
	});
}

/** A JSON string's text, or the text as it is if it isn't one. */
function unquote(part: string) {
	if (!part.startsWith('"')) return part;
	try {
		return String(JSON.parse(part));
	} catch {
		return part;
	}
}
