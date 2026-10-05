import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { type Mode, type ThemeName, themeNames } from "./index.js";
import ThemeSwitcher from "./theme-switcher.svelte";
import { setTheme } from "./theme.remote.js";

// The remote functions read and set cookies on the server; these stand in for them.
const remote = vi.hoisted(() => ({
	mode: "dark" as Mode,
	theme: "harbor" as ThemeName,
	updates: vi.fn(async () => {}),
}));

vi.mock("./theme.remote.js", () => {
	const query = <T>(value: () => T) =>
		vi.fn(() => Object.assign(Promise.resolve(value()), { withOverride: vi.fn() }));
	return {
		getMode: query(() => remote.mode),
		getTheme: query(() => remote.theme),
		setMode: vi.fn(() => ({ updates: remote.updates })),
		setTheme: vi.fn(() => ({ updates: remote.updates })),
	};
});

beforeEach(() => {
	remote.mode = "dark";
	remote.theme = "harbor";
	vi.clearAllMocks();
});

test("the button shows the current theme", async () => {
	render(ThemeSwitcher);

	await expect.element(page.getByRole("button", { name: "Theme" })).toHaveTextContent("Harbor");
});

test("the menu lists every theme and marks the current one", async () => {
	render(ThemeSwitcher);

	await page.getByRole("button", { name: "Theme" }).click();

	const items = page.getByRole("menuitemradio");
	await expect.element(items.first()).toBeVisible();
	expect(items.elements()).toHaveLength(themeNames.length);
	await expect.element(page.getByRole("menuitemradio", { name: "Harbor" })).toBeChecked();
	await expect.element(page.getByRole("menuitemradio", { name: "Sorbet" })).not.toBeChecked();
});

test("each theme's swatch is drawn in that theme", async () => {
	render(ThemeSwitcher);

	await page.getByRole("button", { name: "Theme" }).click();

	const swatch = page.getByRole("menuitemradio", { name: "Brutalist" }).element();
	expect(swatch.querySelector("[data-theme]")?.getAttribute("data-theme")).toBe("brutalist");
});

test("picking a theme saves it", async () => {
	render(ThemeSwitcher);

	await page.getByRole("button", { name: "Theme" }).click();
	await page.getByRole("menuitemradio", { name: "Blueprint" }).click();

	expect(setTheme).toHaveBeenCalledWith("blueprint");
	expect(remote.updates).toHaveBeenCalledOnce();
});
