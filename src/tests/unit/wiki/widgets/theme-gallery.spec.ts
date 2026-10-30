import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { themeNames, themes } from "#lib/themes/index.ts";
import { baseVariables } from "#wiki/widgets/theme-gallery/base-variables.ts";
import { galleryThemes, themeStyle } from "#wiki/widgets/theme-gallery/theme-gallery.ts";

/** The declarations of the rule of `css` whose selectors are `selector` (whitespace aside). */
function declarationsOf(css: string, selector: string): Record<string, string> {
	const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g);
	const wanted = selector.replace(/\s+/g, " ").trim();
	for (const [, head, body] of rules) {
		// A rule's selector follows the statements (`@plugin …;`) before it.
		const found = head.split(";").pop()!.replace(/\s+/g, " ").trim();
		if (found !== wanted) continue;
		return Object.fromEntries(
			[...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
				name,
				value.trim(),
			]),
		);
	}
	return {};
}

const layoutCss = readFileSync(join(import.meta.dirname, "../../../../routes/layout.css"), "utf8");

describe("the theme gallery", () => {
	test("has a card for every registered theme, in the app's order", () => {
		expect(galleryThemes.map((card) => card.name)).toEqual([...themeNames]);
		expect(galleryThemes.map((card) => card.label)).toEqual(
			themeNames.map((name) => themes[name].label),
		);
	});

	test("its base variables are the stylesheet's defaults, light and dark (the copy hasn't drifted)", () => {
		expect(baseVariables.light).toEqual(declarationsOf(layoutCss, ':root, [data-theme="neutral"]'));
		expect(baseVariables.dark).toEqual(
			declarationsOf(layoutCss, '.dark, .dark [data-theme="neutral"]'),
		);
		expect(Object.keys(baseVariables.light).length).toBeGreaterThan(30);
	});

	test("a theme's light style is its variables, and its dark style has the dark ones over them", () => {
		const { theme } = galleryThemes.find((card) => card.name === "harbor")!;
		const light = themeStyle(theme, "light");
		const dark = themeStyle(theme, "dark");
		expect(light).toContain(`--primary: ${theme.vars!["--primary"]}`);
		expect(light).not.toContain(theme.darkVars!["--background"]);
		expect(dark).toContain(`--background: ${theme.darkVars!["--background"]}`);
		expect(dark).not.toContain(`--background: ${theme.vars!["--background"]}`);
		// What dark doesn't change stays.
		expect(dark).toContain(`--font-body: ${theme.vars!["--font-body"]}`);
	});

	test("a theme without variables of its own is the stylesheet's defaults, light and dark", () => {
		expect(themeStyle({ label: "Plain" }, "light")).toContain("--background: oklch(1 0 0)");
		expect(themeStyle({ label: "Plain" }, "dark")).toContain("--background: oklch(0.145 0 0)");
	});

	test("a light card carries the tones too, so a dark page can't turn them dark", () => {
		const light = themeStyle(galleryThemes.find((card) => card.name === "lagoon")!.theme, "light");
		expect(light).toContain("--success:");
		expect(light).toContain("--warning:");
		expect(light).toContain("--info:");
		expect(baseVariables.light["--success"]).not.toBe(baseVariables.dark["--success"]);
	});
});
