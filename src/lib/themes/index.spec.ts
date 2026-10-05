import { describe, expect, test } from "vite-plus/test";

import { parseMode, parseTheme, supportsDark, themeNames, themeStylesheet } from "./index.ts";

describe("cookies", () => {
	test("a known theme is used, anything else falls back to the first", () => {
		expect(parseTheme("harbor")).toBe("harbor");
		expect(parseTheme("nonsense")).toBe(themeNames[0]);
		expect(parseTheme(undefined)).toBe(themeNames[0]);
	});

	test("the mode follows the system unless chosen", () => {
		expect(parseMode("dark")).toBe("dark");
		expect(parseMode("nonsense")).toBe("system");
		expect(parseMode(undefined)).toBe("system");
	});
});

describe("themeStylesheet", () => {
	// The first theme's variables are the defaults in layout.css.
	const [, ...others] = themeNames;

	test.each(others)("scopes %s's variables to its name", (name) => {
		expect(themeStylesheet).toContain(`:root[data-theme="${name}"], [data-theme="${name}"] {`);
	});

	test.each(others)("has dark variables for %s only if it supports dark", (name) => {
		expect(themeStylesheet.includes(`:root.dark[data-theme="${name}"]`)).toBe(supportsDark(name));
	});
});
