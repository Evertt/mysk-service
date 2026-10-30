import { createRawSnippet, tick } from "svelte";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { demoSignInEnabled, getViewAs } from "#routes/demo.remote.ts";
import DemoSwitchedOff from "#wiki/parts/demo-switched-off.svelte";
import Diagram from "#wiki/parts/diagram.svelte";
import DocsPointer from "#wiki/parts/docs-pointer.svelte";
import HowItWorks from "#wiki/parts/how-it-works.svelte";
import PageStatus from "#wiki/parts/page-status.svelte";
import SourceLink from "#wiki/parts/source-link.svelte";
import TryIt from "#wiki/parts/try-it.svelte";

import TryItInPage from "./try-it.test-harness.svelte";

// The remote functions the wiki calls, for try it: whether the SHLTR demo's sign-in is switched
// on, whether the visitor is signed in to the demo (`getViewAs()`), and the sign-in form.
const demo = vi.hoisted(() => ({
	enabled: false,
	fails: false,
	viewAs: null as { current: string | null } | null,
}));
vi.mock("#routes/demo.remote.ts", () => {
	/** A remote form as far as try it uses it: spread on a `<form>`, with its role field's submit. */
	const form = (id: string) =>
		Object.defineProperties(
			{ method: "POST", action: `?/remote=demoSignIn/${id}` },
			{
				pending: { value: 0 },
				fields: {
					value: {
						role: { as: (type: string, value: string) => ({ type, name: "role", value }) },
					},
				},
			},
		);
	return {
		demoSignInEnabled: vi.fn(() =>
			demo.fails ? Promise.reject(new Error("offline")) : Promise.resolve(demo.enabled),
		),
		getViewAs: vi.fn(() => Promise.resolve(demo.viewAs)),
		demoSignIn: { for: vi.fn(form) },
	};
});

const englishByDefault = getLocale;
const text = (html: string) => createRawSnippet(() => ({ render: () => `<span>${html}</span>` }));
const github = "https://github.com/Evertt/mysk-service/blob";

beforeEach(() => {
	demo.enabled = false;
	demo.fails = false;
	demo.viewAs = null;
	vi.mocked(demoSignInEnabled).mockClear();
	vi.mocked(getViewAs).mockClear();
});

/** Waits until try it has asked, and its answers have had their turn in the page. */
async function answered() {
	await vi.waitFor(() => expect(demoSignInEnabled).toHaveBeenCalledTimes(1));
	await Promise.allSettled([
		vi.mocked(demoSignInEnabled).mock.results[0].value,
		...vi.mocked(getViewAs).mock.results.map((result) => result.value),
	]);
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 50));
}

test("the test build knows the commit the source links point at", () => {
	expect(__WIKI_COMMIT__).toBeTruthy();
});

test("a source link points at the file at this commit, on the line, in a new tab", async () => {
	await render(SourceLink, {
		path: "src/lib/orders/lifecycle.ts",
		line: 69,
		children: text("the transition table"),
	});

	const link = page.getByRole("link", { name: "the transition table" });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/src/lib/orders/lifecycle.ts#L69`);
	await expect.element(link).toHaveAttribute("target", "_blank");
	await expect.element(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});

test("a source link without a line has no anchor, and is labelled with the file's name", async () => {
	await render(SourceLink, { path: "src/lib/orders/lifecycle.ts" });

	const link = page.getByRole("link", { name: "lifecycle.ts" });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/src/lib/orders/lifecycle.ts`);
});

test("a docs pointer links to the doc on GitHub, to the section's anchor", async () => {
	await render(DocsPointer, { doc: "docs/agents/tenancy.md", section: "Tenancy rules" });

	const link = page.getByRole("link", { name: /tenancy\.md/ });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/docs/agents/tenancy.md#tenancy-rules`);
	await expect.element(page.getByText(/The rules/)).toBeVisible();
});

test("a docs pointer without a section links to the doc itself", async () => {
	await render(DocsPointer, { doc: "docs/agents/tenancy.md" });

	await expect
		.element(page.getByRole("link", { name: /tenancy\.md/ }))
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/docs/agents/tenancy.md`);
});

test("try it, signed out where the demo's sign-in is on: a button that signs in as the role", async () => {
	demo.enabled = true;
	const { container } = await render(TryIt, { as: "planner" });

	const button = page.getByRole("button", { name: "Try it as the planner" });
	await expect.element(button).toBeVisible();
	// The login page's demo form, posting the role's name, as its buttons do.
	await expect.element(button).toHaveAttribute("type", "submit");
	await expect.element(button).toHaveAttribute("name", "role");
	await expect.element(button).toHaveAttribute("value", "planner");
	const form = container.querySelector("form");
	expect(form?.getAttribute("method")).toBe("POST");
	expect(form?.getAttribute("action")).toBe("?/remote=demoSignIn/planner");
	expect(form?.contains(button.element())).toBe(true);
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("try it, signed in to the demo: nothing (the user menu's View as switches roles)", async () => {
	demo.enabled = true;
	demo.viewAs = { current: "engineer" };
	const { container } = await render(TryIt, { as: "planner" });

	await answered();
	expect(container.textContent).toBe("");
	expect(container.querySelector("form")).toBeNull();
});

test("try it names the role in English, also where the app speaks Dutch", async () => {
	demo.enabled = true;
	overwriteGetLocale(() => "nl");
	try {
		await render(TryIt, { as: "engineer" });
		await expect
			.element(page.getByRole("button", { name: "Try it as the field engineer" }))
			.toBeVisible();
		await render(TryIt, { as: "customer" });
		await expect
			.element(page.getByRole("button", { name: "Try it as the customer contact" }))
			.toBeVisible();
	} finally {
		overwriteGetLocale(englishByDefault);
	}
});

test("try it, where the demo's sign-in is off: nothing, once the answer is in", async () => {
	const { container } = await render(TryIt, { as: "planner" });

	await answered();
	expect(container.textContent).toBe("");
	expect(container.querySelector("form")).toBeNull();
});

test("try it, where the demo's answer fails: nothing, and the rest of the page renders", async () => {
	demo.fails = true;
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	await render(TryItInPage);

	await answered();
	await expect.element(page.getByText("Before the link")).toBeVisible();
	await expect.element(page.getByText("After the link")).toBeVisible();
	expect(page.getByRole("button").elements()).toHaveLength(0);
	errors.mockRestore();
});

test("where the demo's sign-in is off, the try-the-demo page says so", async () => {
	await render(DemoSwitchedOff);

	await expect
		.element(page.getByText("One-click demo sign-in is switched off on this server."))
		.toBeVisible();
});

test("where the demo's sign-in is on, or can't be asked, that notice is absent", async () => {
	demo.enabled = true;
	const on = await render(DemoSwitchedOff);
	await answered();
	expect(on.container.textContent?.trim()).toBe("");
	on.unmount();

	demo.enabled = false;
	demo.fails = true;
	vi.mocked(demoSignInEnabled).mockClear();
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	const failing = await render(DemoSwitchedOff);
	await answered();
	expect(failing.container.textContent?.trim()).toBe("");
	errors.mockRestore();
});

test("the how-it-works divider: the heading, before the developer half", async () => {
	await render(HowItWorks);

	await expect.element(page.getByRole("heading", { name: "How it works" })).toBeVisible();
});

test("a built page has no status notice", async () => {
	const { container } = await render(PageStatus, { status: "built" });

	expect(container.querySelector("[data-callout]")).toBeNull();
	expect(container.textContent).toBe("");
});

test("a page that is planned says so", async () => {
	const { container } = await render(PageStatus, { status: "planned" });

	await expect.element(page.getByText(/planned/i)).toBeVisible();
	expect(container.querySelector("[data-callout]")).not.toBeNull();
});

test("a page that is partly built says so", async () => {
	const { container } = await render(PageStatus, { status: "partly built" });

	await expect.element(page.getByText(/partly built/i)).toBeVisible();
	expect(container.querySelector("[data-callout]")).not.toBeNull();
});

test("a diagram is an image of its label, as wide as its container, with its children inside", async () => {
	const { container } = await render(Diagram, {
		viewBox: "0 0 200 100",
		label: "Order lifecycle",
		children: createRawSnippet(() => ({ render: () => '<rect width="10" height="10" />' })),
	});

	const svg = page.getByRole("img", { name: "Order lifecycle" });
	await expect.element(svg).toBeVisible();
	await expect.element(svg).toHaveAttribute("viewBox", "0 0 200 100");
	await expect.element(svg).toHaveAttribute("width", "100%");
	expect(container.querySelector("svg rect")).not.toBeNull();
});
