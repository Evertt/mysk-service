import { describe, expect, test } from "vite-plus/test";

import {
	DEFAULT_THEME,
	parseMode,
	parseTheme,
	themeNames,
	themes,
	themeStylesheet,
} from "#lib/themes/index.ts";

describe("cookies", () => {
	test("a known theme is used, anything else falls back to the default (Lagoon)", () => {
		expect(parseTheme("neutral")).toBe("neutral");
		expect(parseTheme("nonsense")).toBe(DEFAULT_THEME);
		expect(parseTheme(undefined)).toBe("lagoon");
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

	test.each(others)("has dark variables for %s if it defines them", (name) => {
		expect(themeStylesheet.includes(`:root.dark[data-theme="${name}"]`)).toBe(
			"darkVars" in themes[name],
		);
	});
});
