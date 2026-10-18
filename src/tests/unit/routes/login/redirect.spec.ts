/** Where signing in leads: only to a path on this site, never to another one. */
import { expect, test } from "vite-plus/test";

import { safeRedirect } from "#routes/login/redirect.ts";

test("keeps a local path, with its search and hash", () => {
	expect(safeRedirect("/orders?status=open#top")).toBe("/orders?status=open#top");
	expect(safeRedirect("/q/abc123")).toBe("/q/abc123");
});

test("leads to the start page for nothing, or anything a browser reads as another site", () => {
	for (const path of [
		undefined,
		"",
		"orders",
		"https://evil.example",
		"//evil.example",
		"/\\evil.example",
		"/\t/evil.example",
		"/\n/evil.example",
		"/\r/evil.example",
		"\\\\evil.example",
	]) {
		expect(safeRedirect(path), JSON.stringify(path)).toBe("/");
	}
});
