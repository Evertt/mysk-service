import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import type { Mode, ThemeName } from "#lib/themes/index.ts";
import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
import { setMode } from "#lib/themes/theme.remote.ts";

// The remote functions read and set cookies on the server; these stand in for them.
const remote = vi.hoisted(() => ({
	mode: "dark" as Mode,
	theme: "harbor" as ThemeName,
	updates: vi.fn(async () => {}),
}));

vi.mock("#lib/themes/theme.remote.ts", () => {
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

test.each<[Mode, string]>([
	["light", "Light"],
	["dark", "Dark"],
	["system", "System"],
])("the button names the %s mode", async (mode, label) => {
	remote.mode = mode;
	render(ModeSwitcher);

	await expect
		.element(page.getByRole("button", { name: `Colour mode: ${label}` }))
		.toBeInTheDocument();
});

test("the menu marks the current mode", async () => {
	render(ModeSwitcher);

	await page.getByRole("button", { name: "Colour mode: Dark" }).click();

	await expect.element(page.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
	await expect.element(page.getByRole("menuitemradio", { name: "Light" })).not.toBeChecked();
});

test("picking a mode saves it", async () => {
	render(ModeSwitcher);

	await page.getByRole("button", { name: "Colour mode: Dark" }).click();
	await page.getByRole("menuitemradio", { name: "System" }).click();

	expect(setMode).toHaveBeenCalledWith("system");
	expect(remote.updates).toHaveBeenCalledOnce();
});
