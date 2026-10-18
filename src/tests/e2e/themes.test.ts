import { describe, expect, test } from "vite-plus/test";

import { baseURL, useApp, quiet } from "./app.ts";

const app = useApp();

/** The theme and mode as rendered, and whether `dark` was set before `<body>` (no flash). */
const state = () =>
	app.page.evaluate(() => ({
		theme: document.documentElement.dataset.theme,
		mode: document.documentElement.dataset.mode,
		dark: document.documentElement.classList.contains("dark"),
		darkBeforeBody: (window as { darkBeforeBody?: boolean }).darkBeforeBody ?? false,
	}));

const setCookies = (cookies: Record<string, string>) =>
	app.page
		.context()
		.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: baseURL })));

const reload = async () => {
	await app.page.reload();
	await quiet(app.page);
};

const choose = async (menu: string | RegExp, item: string) => {
	await app.page.getByRole("button", { name: menu }).click();
	await app.submit(app.page.getByRole("menuitemradio", { name: item }));
	await app.page.keyboard.press("Escape");
};

describe("on page load", () => {
	test("the theme and mode come from the cookies, rendered by the server", async () => {
		await setCookies({ theme: "harbor", mode: "dark" });
		const response = await app.go("/orders");
		const html = await response!.text();
		expect(html).toMatch(/<html[^>]*data-theme="harbor"[^>]*data-mode="dark"[^>]*class="dark"/);
		expect(await state()).toMatchObject({ theme: "harbor", mode: "dark", dark: true });
	});

	test("system mode follows the operating system before the page is shown", async () => {
		await app.page.context().addInitScript(() => {
			new MutationObserver((_, observer) => {
				if (document.documentElement?.classList.contains("dark")) {
					(window as { darkBeforeBody?: boolean }).darkBeforeBody = !document.body;
					observer.disconnect();
				}
			}).observe(document, { subtree: true, childList: true, attributes: true });
		});
		await setCookies({ theme: "harbor", mode: "system" });

		await app.page.emulateMedia({ colorScheme: "dark" });
		await app.go("/orders");
		expect(await state()).toMatchObject({ mode: "system", dark: true, darkBeforeBody: true });

		await app.page.emulateMedia({ colorScheme: "light" });
		await app.go("/orders");
		expect(await state()).toMatchObject({ mode: "system", dark: false });
	});
});

describe("the switchers", () => {
	test("choosing a mode applies it, choosing a theme keeps the mode, and both are remembered", async () => {
		await setCookies({ theme: "harbor", mode: "light" });
		await app.go("/orders");
		await choose(/^Colour mode/, "Dark");
		expect(await state()).toMatchObject({ theme: "harbor", mode: "dark", dark: true });
		await choose("Theme", "Blueprint");
		expect(await state()).toMatchObject({ theme: "blueprint", dark: true });
		await reload();
		expect(await state()).toMatchObject({ theme: "blueprint", mode: "dark", dark: true });
	});
});
