import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { type Browser, collectContext } from "#lib/bug-reports/context.ts";
import { clientContextSchema } from "#lib/bug-reports/report.ts";

const browser = (overrides: Partial<Browser> = {}): Browser => ({
	innerWidth: 1280,
	innerHeight: 800,
	devicePixelRatio: 2,
	navigator: { userAgent: "Test/1.0", languages: ["nl-NL", "en"], onLine: true },
	document: {
		documentElement: {
			dataset: { theme: "lagoon", mode: "system", tableDensity: "compact" },
			classList: { contains: (name) => name === "dark" },
		},
	},
	...overrides,
});

test("collects the page, the app and the browser as they are when recording starts", () => {
	const context = collectContext(
		{ url: "http://localhost/orders?status=quote", routeId: "/(app)/orders" },
		{ version: "1760000000000", locale: "nl", timeZone: "Europe/Amsterdam" },
		browser(),
	);
	expect(context).toEqual({
		url: "http://localhost/orders?status=quote",
		routeId: "/(app)/orders",
		version: "1760000000000",
		viewport: { width: 1280, height: 800, pixelRatio: 2 },
		userAgent: "Test/1.0",
		locale: "nl",
		languages: ["nl-NL", "en"],
		timeZone: "Europe/Amsterdam",
		theme: "lagoon",
		mode: "system",
		dark: true,
		density: "compact",
		online: true,
	});
	// What the server accepts.
	expect(v.is(clientContextSchema, context)).toBe(true);
});

test("says when the browser is offline, in light mode, without a theme rendered", () => {
	const context = collectContext(
		{ url: "http://localhost/my", routeId: null },
		{ version: "1", locale: "en", timeZone: "UTC" },
		browser({
			navigator: { userAgent: "Test/1.0", languages: [], onLine: false },
			document: { documentElement: { dataset: {}, classList: { contains: () => false } } },
		}),
	);
	expect(context).toMatchObject({
		routeId: null,
		online: false,
		dark: false,
		theme: "",
		mode: "",
		density: "",
	});
});
