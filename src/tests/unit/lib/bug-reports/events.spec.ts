import { expect, test } from "vite-plus/test";

import {
	consoleEntries,
	consolePlugin,
	type RecordedEvent,
	requestEntries,
	requestTag,
} from "#lib/bug-reports/events.ts";

const events: RecordedEvent[] = [
	{ type: 4, timestamp: 1000, data: { href: "http://localhost/", width: 1280, height: 800 } },
	{ type: 2, timestamp: 1010, data: {} },
	{
		type: 6,
		timestamp: 1500,
		data: {
			plugin: consolePlugin,
			payload: { level: "error", trace: ["at load (app.js:1:2)"], payload: ['"Failed:"', "42"] },
		},
	},
	{
		type: 5,
		timestamp: 2250,
		data: {
			tag: requestTag,
			payload: {
				kind: "remote",
				name: "getOrder",
				method: "GET",
				status: 500,
				durationMs: 80,
				size: null,
			},
		},
	},
	{ type: 5, timestamp: 2300, data: { tag: "something-else", payload: {} } },
	{ type: 6, timestamp: 2400, data: { plugin: "rrweb/other@1", payload: {} } },
];

test("finds the console's messages, as text, at their moments", () => {
	expect(consoleEntries(events)).toEqual([
		{ offset: 500, entry: { level: "error", text: "Failed: 42", trace: ["at load (app.js:1:2)"] } },
	]);
});

test("finds the requests at their moments", () => {
	expect(requestEntries(events)).toEqual([
		{
			offset: 1250,
			entry: {
				kind: "remote",
				name: "getOrder",
				method: "GET",
				status: 500,
				durationMs: 80,
				size: null,
			},
		},
	]);
});

test("finds nothing in no events", () => {
	expect(consoleEntries([])).toEqual([]);
	expect(requestEntries([])).toEqual([]);
});
