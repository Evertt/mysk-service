/**
 * A bug report, as the recorder in the headers sends it (`recorder.svelte.ts`) and the server
 * stores it (`#lib/server/bug-reports/`): the recording itself, rrweb's events gzipped, and a
 * summary beside it, which the server reads for the report's row and its mail without unpacking
 * the recording. Shared by both, so the limits and the summary's shape are the same on each side.
 */
import * as v from "valibot";

import { wholeIn } from "#lib/schema.ts";

/** The longest recording: it stops by itself then, and asks for a note. */
export const maxRecordingMs = 10 * 60 * 1000;

/** The largest recording the server takes, gzipped. */
export const maxReportBytes = 20 * 1024 * 1024;

/** Where the recorder posts a report (`src/routes/bug-reports/+server.ts`). */
export const uploadPath = "/bug-reports";

/** What the browser says about itself and the page when the recording starts (`context.ts`). */
export const clientContextSchema = v.object({
	url: v.pipe(v.string(), v.maxLength(2000)),
	routeId: v.nullable(v.pipe(v.string(), v.maxLength(500))),
	/** The app's version (`version` of `$app/env`), to tell which deployment it was. */
	version: v.pipe(v.string(), v.maxLength(100)),
	viewport: v.object({ width: v.number(), height: v.number(), pixelRatio: v.number() }),
	userAgent: v.pipe(v.string(), v.maxLength(1000)),
	/** The app's language and the browser's own. */
	locale: v.pipe(v.string(), v.maxLength(20)),
	languages: v.array(v.pipe(v.string(), v.maxLength(50))),
	timeZone: v.pipe(v.string(), v.maxLength(100)),
	theme: v.pipe(v.string(), v.maxLength(50)),
	/** The mode chosen (light, dark, system) and whether the page is dark. */
	mode: v.pipe(v.string(), v.maxLength(20)),
	dark: v.boolean(),
	density: v.pipe(v.string(), v.maxLength(20)),
	online: v.boolean(),
});

export type ClientContext = v.InferOutput<typeof clientContextSchema>;

/** The summary sent beside the recording. Who sent it is the server's to say, never the body's. */
export const reportSummarySchema = v.object({
	note: v.pipe(v.string(), v.trim(), v.maxLength(5000)),
	/** When the recording started, in milliseconds since 1970. */
	startedAt: wholeIn(),
	durationMs: wholeIn(),
	context: clientContextSchema,
	/** The console's errors and warnings, as text, for the mail (the replay page reads the events). */
	errors: v.pipe(v.array(v.pipe(v.string(), v.maxLength(2000))), v.maxLength(50)),
});

export type ReportSummary = v.InferOutput<typeof reportSummarySchema>;

/**
 * What the server adds to the browser's context: who reported it, in which organization, as what,
 * and with which modules on. Stored with the report.
 */
export interface ReportContext extends ClientContext {
	organization: { name: string; slug: string };
	roles: string[];
	modules: string[];
}
